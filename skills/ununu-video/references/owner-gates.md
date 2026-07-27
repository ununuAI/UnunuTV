# Owner 门

自动化不能静默替代 Owner 的创意验收。

## 常见门

| blocker.code | 含义 | 决策 |
|---|---|---|
| `story_owner_acceptance_required` | 剧情 revision 未 ACCEPT | 审 story → owner-decide |
| `shot_script_owner_acceptance_required` | 分镜 revision 未 ACCEPT | 审 shots → owner-decide |
| `story_packet_required` / `visual_bible_required` | 上游合同缺失 | 补合同后 advance |

## owner-decide

```bash
node apps/cli/src/index.mjs workflow owner-decide --project PROJECT \
  --data '{
    "targetType":"cinematic_story_revision",
    "targetId":"cinematic-story:…:r1",
    "state":"accepted"
  }'
```

`state` 仅 `accepted` | `rejected`。

## 资产晋升

像素 ACCEPT 后：

```bash
node apps/cli/src/index.mjs series promote-asset --series SERIES \
  --data '{"kind":"character","displayName":"林夏","acceptedMediaId":"…","freeze":true}'
```

`freeze:true` 后禁止静默换脸；变体必须带 `parentEntryId`。
