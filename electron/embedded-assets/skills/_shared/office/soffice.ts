/**
 * Helper for running LibreOffice (soffice) in environments where AF_UNIX
 * sockets may be blocked (e.g., sandboxed VMs). Detects the restriction
 * at runtime and applies an LD_PRELOAD shim if needed.
 *
 * Usage:
 *   import { runSoffice, getSofficeEnv } from "./soffice.js";
 *
 *   // Option 1 - run soffice directly
 *   const result = runSoffice(["--headless", "--convert-to", "pdf", "input.docx"]);
 *
 *   // Option 2 - get env dict for your own subprocess calls
 *   const env = getSofficeEnv();
 *   execSync("soffice ...", { env });
 *
 * CLI:
 *   npx tsx soffice.ts --headless --convert-to pdf input.docx
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";
import { execSync, spawnSync, SpawnSyncReturns } from "node:child_process";

/* ------------------------------------------------------------------ */
/*  C shim source (for Linux/macOS AF_UNIX workaround)                 */
/* ------------------------------------------------------------------ */

const SHIM_SOURCE = `
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <unistd.h>

static int (*real_socket)(int, int, int);
static int (*real_socketpair)(int, int, int, int[2]);
static int (*real_listen)(int, int);
static int (*real_accept)(int, struct sockaddr *, socklen_t *);
static int (*real_close)(int);
static int (*real_read)(int, void *, size_t);

/* Per-FD bookkeeping (FDs >= 1024 are passed through unshimmed). */
static int is_shimmed[1024];
static int peer_of[1024];
static int wake_r[1024];            /* accept() blocks reading this */
static int wake_w[1024];            /* close()  writes to this      */
static int listener_fd = -1;        /* FD that received listen()    */

__attribute__((constructor))
static void init(void) {
    real_socket     = dlsym(RTLD_NEXT, "socket");
    real_socketpair = dlsym(RTLD_NEXT, "socketpair");
    real_listen     = dlsym(RTLD_NEXT, "listen");
    real_accept     = dlsym(RTLD_NEXT, "accept");
    real_close      = dlsym(RTLD_NEXT, "close");
    real_read       = dlsym(RTLD_NEXT, "read");
    for (int i = 0; i < 1024; i++) {
        peer_of[i] = -1;
        wake_r[i]  = -1;
        wake_w[i]  = -1;
    }
}

/* ---- socket ---------------------------------------------------------- */
int socket(int domain, int type, int protocol) {
    if (domain == AF_UNIX) {
        int fd = real_socket(domain, type, protocol);
        if (fd >= 0) return fd;
        /* socket(AF_UNIX) blocked - fall back to socketpair(). */
        int sv[2];
        if (real_socketpair(domain, type, protocol, sv) == 0) {
            if (sv[0] >= 0 && sv[0] < 1024) {
                is_shimmed[sv[0]] = 1;
                peer_of[sv[0]]    = sv[1];
                int wp[2];
                if (pipe(wp) == 0) {
                    wake_r[sv[0]] = wp[0];
                    wake_w[sv[0]] = wp[1];
                }
            }
            return sv[0];
        }
        errno = EPERM;
        return -1;
    }
    return real_socket(domain, type, protocol);
}

/* ---- listen ---------------------------------------------------------- */
int listen(int sockfd, int backlog) {
    if (sockfd >= 0 && sockfd < 1024 && is_shimmed[sockfd]) {
        listener_fd = sockfd;
        return 0;
    }
    return real_listen(sockfd, backlog);
}

/* ---- accept ---------------------------------------------------------- */
int accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen) {
    if (sockfd >= 0 && sockfd < 1024 && is_shimmed[sockfd]) {
        /* Block until close() writes to the wake pipe. */
        if (wake_r[sockfd] >= 0) {
            char buf;
            real_read(wake_r[sockfd], &buf, 1);
        }
        errno = ECONNABORTED;
        return -1;
    }
    return real_accept(sockfd, addr, addrlen);
}

/* ---- close ----------------------------------------------------------- */
int close(int fd) {
    if (fd >= 0 && fd < 1024 && is_shimmed[fd]) {
        int was_listener = (fd == listener_fd);
        is_shimmed[fd] = 0;

        if (wake_w[fd] >= 0) {              /* unblock accept() */
            char c = 0;
            write(wake_w[fd], &c, 1);
            real_close(wake_w[fd]);
            wake_w[fd] = -1;
        }
        if (wake_r[fd] >= 0) { real_close(wake_r[fd]); wake_r[fd]  = -1; }
        if (peer_of[fd] >= 0) { real_close(peer_of[fd]); peer_of[fd] = -1; }

        if (was_listener)
            _exit(0);                        /* conversion done - exit */
    }
    return real_close(fd);
}
`;

const SHIM_SO_PATH = path.join(os.tmpdir(), "lo_socket_shim.so");

/* ------------------------------------------------------------------ */
/*  Shim detection and building                                        */
/* ------------------------------------------------------------------ */

function needsShim(): boolean {
  // Only needed on Linux/macOS where AF_UNIX might be blocked
  if (os.platform() === "win32") return false;

  try {
    const server = net.createServer();
    const sockPath = path.join(os.tmpdir(), `_lo_test_${process.pid}.sock`);
    try {
      server.listen(sockPath);
      server.close();
      fs.unlinkSync(sockPath);
      return false;
    } catch {
      return true;
    }
  } catch {
    return true;
  }
}

function ensureShim(): string {
  if (fs.existsSync(SHIM_SO_PATH)) return SHIM_SO_PATH;

  const srcPath = path.join(os.tmpdir(), "lo_socket_shim.c");
  fs.writeFileSync(srcPath, SHIM_SOURCE);
  try {
    execSync(
      `gcc -shared -fPIC -o ${JSON.stringify(SHIM_SO_PATH)} ${JSON.stringify(srcPath)} -ldl`,
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  } finally {
    try { fs.unlinkSync(srcPath); } catch { /* ignore */ }
  }
  return SHIM_SO_PATH;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get environment variables for running soffice.
 * Includes SAL_USE_VCLPLUGIN=svp and LD_PRELOAD shim if needed.
 */
export function getSofficeEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  env["SAL_USE_VCLPLUGIN"] = "svp";

  if (needsShim()) {
    try {
      const shimPath = ensureShim();
      env["LD_PRELOAD"] = shimPath;
    } catch {
      // If shim build fails, continue without it
    }
  }

  return env;
}

/**
 * Run soffice with the given arguments.
 * Returns the result of spawnSync.
 */
export function runSoffice(
  args: string[],
  options?: { timeout?: number; cwd?: string },
): SpawnSyncReturns<string> {
  const env = getSofficeEnv();
  return spawnSync("soffice", args, {
    env,
    encoding: "utf-8",
    timeout: options?.timeout,
    cwd: options?.cwd,
  });
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

if (process.argv[1] && (process.argv[1].endsWith("soffice.ts") || process.argv[1].endsWith("soffice.js"))) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx tsx soffice.ts [soffice args...]");
    console.error("Example: npx tsx soffice.ts --headless --convert-to pdf input.docx");
    process.exit(1);
  }

  const result = runSoffice(args);

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  process.exit(result.status ?? 1);
}
