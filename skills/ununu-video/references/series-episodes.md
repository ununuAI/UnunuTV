# 系列 / 多集

第 1 集也创建 Series，避免续集资产散落。

## 创建

```bash
node apps/cli/src/index.mjs series create \
  --data '{"title":"雨夜复仇","contentType":"short_drama","targetEpisodeSeconds":60}'
```

## 开集

```bash
node apps/cli/src/index.mjs workflow cinematic-start \
  --project P --production PR --source-node N \
  --data '{"brief":"…","seriesId":"S","episodeNumber":1}'
```

Ep2+：

1. 默认 `bindSharedAssetsForEpisode` 绑定 accepted library
2. Story 继承 ledger 的 `revealedFacts` / `forbiddenEarlyInfo`
3. 禁止无故新建同角色脸

## 集末

```bash
node apps/cli/src/index.mjs series ledger-commit --series S \
  --data '{"episodeId":"…","patch":{"plot":{"revealedFacts":["…"]}}}'
```

## 复用优先级

1. library accepted + freeze identity  
2. 合法 variant（parentEntryId）  
3. 仅缺失时新建 → Owner 像素 ACCEPT → promote  
