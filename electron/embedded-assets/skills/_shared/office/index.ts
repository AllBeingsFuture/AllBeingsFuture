/**
 * Shared Office (OOXML) utilities for DOCX, PPTX, and XLSX processing.
 *
 * This module consolidates all Office file manipulation code into a single
 * shared location, eliminating duplication across the docx, pptx, and xlsx skills.
 *
 * Main modules:
 *   - pack    : Pack unpacked OOXML directory back into .docx/.pptx/.xlsx
 *   - unpack  : Unpack OOXML file into directory with pretty-printed XML
 *   - validate: Validate OOXML structure and tracked changes
 *   - soffice : LibreOffice headless conversion wrapper
 *
 * Validators:
 *   - BaseSchemaValidator   : Base class with common validation logic
 *   - DOCXSchemaValidator   : DOCX-specific validation
 *   - PPTXSchemaValidator   : PPTX-specific validation
 *   - RedliningValidator    : Tracked changes (redlining) validation
 *
 * Helpers:
 *   - mergeRuns          : Merge adjacent XML runs with identical formatting
 *   - simplifyRedlines   : Merge adjacent tracked changes from same author
 *   - inferAuthor        : Infer which author made new tracked changes
 */

// -- Main modules --
export { pack } from "./pack.js";
export { unpack } from "./unpack.js";
export { validate } from "./validate.js";
export type { ValidateOptions } from "./validate.js";
export { runSoffice, getSofficeEnv } from "./soffice.js";

// -- Validators --
export { BaseSchemaValidator } from "./validators/base.js";
export type { ValidatorOptions } from "./validators/base.js";
export { DOCXSchemaValidator } from "./validators/docx.js";
export { PPTXSchemaValidator } from "./validators/pptx.js";
export { RedliningValidator } from "./validators/redlining.js";
export type { RedliningValidatorOptions } from "./validators/redlining.js";

// -- Helpers --
export { mergeRuns } from "./helpers/merge-runs.js";
export {
  simplifyRedlines,
  getTrackedChangeAuthors,
  inferAuthor,
} from "./helpers/simplify-redlines.js";
