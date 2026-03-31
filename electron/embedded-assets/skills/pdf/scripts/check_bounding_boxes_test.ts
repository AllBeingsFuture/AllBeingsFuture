import { getBoundingBoxMessages } from "./check_bounding_boxes";

// Simple test runner (no external test framework dependency)
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    passed++;
  }
}

function assertTrue(condition: boolean, message: string): void {
  assert(condition, message);
}

function assertFalse(condition: boolean, message: string): void {
  assert(!condition, message);
}

function createJsonString(data: unknown): string {
  return JSON.stringify(data);
}

function test(name: string, fn: () => void): void {
  console.log(`Test: ${name}`);
  try {
    fn();
    console.log(`  OK`);
  } catch (e) {
    console.error(`  ERROR: ${e}`);
    failed++;
  }
}

test("no intersections", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [60, 10, 150, 30],
      },
      {
        description: "Email",
        page_number: 1,
        label_bounding_box: [10, 40, 50, 60],
        entry_bounding_box: [60, 40, 150, 60],
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should have SUCCESS message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("FAILURE")),
    "Should not have FAILURE message"
  );
});

test("label entry intersection same field", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 60, 30],
        entry_bounding_box: [50, 10, 150, 30], // Overlaps with label
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("FAILURE") && msg.includes("intersection")),
    "Should have FAILURE intersection message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should not have SUCCESS message"
  );
});

test("intersection between different fields", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [60, 10, 150, 30],
      },
      {
        description: "Email",
        page_number: 1,
        label_bounding_box: [40, 20, 80, 40], // Overlaps with Name's boxes
        entry_bounding_box: [160, 10, 250, 30],
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("FAILURE") && msg.includes("intersection")),
    "Should have FAILURE intersection message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should not have SUCCESS message"
  );
});

test("different pages no intersection", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [60, 10, 150, 30],
      },
      {
        description: "Email",
        page_number: 2,
        label_bounding_box: [10, 10, 50, 30], // Same coordinates but different page
        entry_bounding_box: [60, 10, 150, 30],
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should have SUCCESS message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("FAILURE")),
    "Should not have FAILURE message"
  );
});

test("entry height too small", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [60, 10, 150, 20], // Height is 10
        entry_text: {
          font_size: 14, // Font size larger than height
        },
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("FAILURE") && msg.includes("height")),
    "Should have FAILURE height message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should not have SUCCESS message"
  );
});

test("entry height adequate", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [60, 10, 150, 30], // Height is 20
        entry_text: {
          font_size: 14, // Font size smaller than height
        },
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should have SUCCESS message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("FAILURE")),
    "Should not have FAILURE message"
  );
});

test("default font size", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [60, 10, 150, 20], // Height is 10
        entry_text: {}, // No font_size specified, should use default 14
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("FAILURE") && msg.includes("height")),
    "Should have FAILURE height message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should not have SUCCESS message"
  );
});

test("no entry text", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [60, 10, 150, 20], // Small height but no entry_text
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should have SUCCESS message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("FAILURE")),
    "Should not have FAILURE message"
  );
});

test("multiple errors limit", () => {
  const fields = [];
  // Create many overlapping fields
  for (let i = 0; i < 25; i++) {
    fields.push({
      description: `Field${i}`,
      page_number: 1,
      label_bounding_box: [10, 10, 50, 30], // All overlap
      entry_bounding_box: [20, 15, 60, 35], // All overlap
    });
  }

  const data = { form_fields: fields };

  const messages = getBoundingBoxMessages(createJsonString(data));
  // Should abort after ~20 messages
  assertTrue(
    messages.some((msg) => msg.includes("Aborting")),
    "Should have Aborting message"
  );
  // Should have some FAILURE messages but not hundreds
  const failureCount = messages.filter((msg) => msg.includes("FAILURE")).length;
  assertTrue(failureCount > 0, "Should have at least one FAILURE");
  assertTrue(messages.length < 30, "Should be limited to fewer than 30 messages");
});

test("edge touching boxes", () => {
  const data = {
    form_fields: [
      {
        description: "Name",
        page_number: 1,
        label_bounding_box: [10, 10, 50, 30],
        entry_bounding_box: [50, 10, 150, 30], // Touches at x=50
      },
    ],
  };

  const messages = getBoundingBoxMessages(createJsonString(data));
  assertTrue(
    messages.some((msg) => msg.includes("SUCCESS")),
    "Should have SUCCESS message"
  );
  assertFalse(
    messages.some((msg) => msg.includes("FAILURE")),
    "Should not have FAILURE message"
  );
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
