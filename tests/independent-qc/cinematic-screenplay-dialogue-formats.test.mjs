import assert from "node:assert/strict";
import test from "node:test";
import {
  assessScreenplayDialogueInventory,
  extractScreenplayDialogueInventory,
  screenplayContentChecksum
} from "@ununu/unutv-contracts";

function screenplay(content) {
  return {
    documentId: "screenplay-markdown-dialogue",
    revision: 1,
    checksum: screenplayContentChecksum(content),
    content
  };
}

test("dialogue coverage must recognize the Markdown screenplay speaker-block format", () => {
  const document = screenplay([
    "# EP01",
    "",
    "## 场一｜内景·入口·傍晚",
    "",
    "木箱底板裂开。",
    "",
    "**陆星野**",
    "（压低声音）",
    "这箱谁的？",
    "",
    "**苏禾**",
    "先问。"
  ].join("\n"));

  assert.deepEqual(
    extractScreenplayDialogueInventory(document).map(({ ordinal, speaker, text }) => ({
      ordinal,
      speaker,
      text
    })),
    [
      { ordinal: 1, speaker: "陆星野", text: "这箱谁的？" },
      { ordinal: 2, speaker: "苏禾", text: "先问。" }
    ]
  );
  assert.equal(
    assessScreenplayDialogueInventory({
      dialogueInventory: [],
      screenplayDocument: document
    }).ok,
    false,
    "an empty inventory must not pass when the screenplay contains speaker-block dialogue"
  );
});

test("audible quoted speech embedded in action must not disappear from dialogue coverage", () => {
  const document = screenplay([
    "# EP01",
    "",
    "## 场一｜内景·入口·傍晚",
    "",
    "木箱底板裂开。",
    "",
    "沈一川一手拉箱子，一手接工作电话，压低声音说“我在线”。",
    "",
    "叶真挂断试镜电话，笑着说“没事”。"
  ].join("\n"));

  assert.deepEqual(
    extractScreenplayDialogueInventory(document).map(({ ordinal, speaker, text }) => ({
      ordinal,
      speaker,
      text
    })),
    [
      { ordinal: 1, speaker: "沈一川", text: "我在线" },
      { ordinal: 2, speaker: "叶真", text: "没事" }
    ]
  );
});
