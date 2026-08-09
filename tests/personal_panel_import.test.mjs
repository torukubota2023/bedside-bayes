/* 実測パネル取り込み（personal-panel v1）の検証ロジックのテスト。
   index.html の PPIMPORT / PPHASH マーカー区間を切り出して node で実行する。
   実行: node tests/personal_panel_import.test.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
function extract(begin, end) {
  const a = html.indexOf(begin), b = html.indexOf(end);
  if (a < 0 || b < 0 || b <= a) throw new Error("マーカーが見つからない: " + begin);
  return html.slice(a + begin.length, b);
}
const src =
  extract("/* PPIMPORT:BEGIN */", "/* PPIMPORT:END */") +
  "\n" +
  extract("PPHASH:BEGIN */", "/* PPHASH:END */");
const { validatePersonalPanel, buildMesFinding, parseCustomParam } = new Function(
  src + "\nreturn {validatePersonalPanel, buildMesFinding, parseCustomParam};"
)();

const DBKEYS = ["cap", "eff", "hf", "copd"];

/* 2×2 の計数から、契約どおりの整合した1所見を作る（Haldane 補正対応） */
function findingFrom(id, nm, cat, tp, fp, fn, tn, opts = {}) {
  const h = opts.corrected ? 0.5 : 0;
  const sens = (tp + h) / (tp + fn + 2 * h);
  const spec = (tn + h) / (fp + tn + 2 * h);
  return Object.assign(
    { id, nm, cat, lp: sens / (1 - spec), ln: (1 - sens) / spec,
      counts: { tp, fp, fn, tn }, sens, spec, corrected: !!opts.corrected },
    opts.extra || {}
  );
}
function panelJSON(overrides = {}, findings) {
  return JSON.stringify(Object.assign({
    app: "kotaeawase-note", type: "personal-panel", version: 1,
    exportedAt: "2026-08-09T12:00:00+09:00",
    disease: { noteId: "effusion", bedsideKey: "eff", label: "胸水" },
    n: { present: 12, absent: 15 },
    findings: findings || [
      findingFrom("ef_fremitus_dec", "触覚振盪の低下（実測）", "触診", 9, 2, 3, 13,
        { extra: { ci: [1.8, 15.1], cin: [0.1, 0.8] } })
    ]
  }, overrides));
}

let n = 0, failed = 0;
function t(name, fn) {
  n++;
  try { fn(); console.log("  ok " + String(n).padStart(2) + "  " + name); }
  catch (e) { failed++; console.error("FAIL " + String(n).padStart(2) + "  " + name + "\n      " + e.message); }
}
const okOf = (json) => validatePersonalPanel(json, DBKEYS);

console.log("== validatePersonalPanel: 正常系 ==");
t("整合したパネルを受理し、id に m_ 接頭辞・tag 用の正規化がされる", () => {
  const r = okOf(panelJSON());
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.data.bedsideKey, "eff");
  const f = r.data.findings[0];
  assert.equal(f.id, "m_ef_fremitus_dec");
  assert.equal(f.nm, "触覚振盪の低下（実測）");
  assert.equal(f.viable, true);
  assert.equal(f.corrected, false);
});
t("ci / cin が素通しで保持される", () => {
  const f = okOf(panelJSON()).data.findings[0];
  assert.deepEqual(f.ci, [1.8, 15.1]);
  assert.deepEqual(f.cin, [0.1, 0.8]);
});
t("nm に「（実測）」が無ければ補う", () => {
  const r = okOf(panelJSON({}, [findingFrom("x", "呼吸音減弱", "聴診", 9, 2, 3, 13)]));
  assert.equal(r.data.findings[0].nm, "呼吸音減弱（実測）");
});
t("cat が無ければ「実測」になる", () => {
  const r = okOf(panelJSON({}, [findingFrom("x", "a（実測）", undefined, 9, 2, 3, 13)]));
  assert.equal(r.data.findings[0].cat, "実測");
});
t("検査として不成立（感度+特異度<1）でも拒否せず viable:false で受理", () => {
  const r = okOf(panelJSON({}, [findingFrom("x", "a（実測）", "触診", 3, 5, 7, 5)])); // sens .3 spec .5
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.data.findings[0].viable, false);
  assert.ok(r.data.findings[0].lp < 1 && r.data.findings[0].ln > 1);
});
t("境界（感度+特異度=1、LR がちょうど 1）も viable:false", () => {
  const r = okOf(panelJSON({}, [findingFrom("x", "a（実測）", "触診", 5, 5, 5, 5)]));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.data.findings[0].viable, false);
});
t("ゼロセル補正入り（corrected:true、Haldane 値で整合）を受理し flag を保持", () => {
  const r = okOf(panelJSON({}, [findingFrom("x", "a（実測）", "触診", 9, 0, 3, 15, { corrected: true })]));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.data.findings[0].corrected, true);
  assert.equal(r.data.findings[0].viable, true);
});
t("複数所見（成立と不成立の混在）を受理", () => {
  const r = okOf(panelJSON({}, [
    findingFrom("a", "a（実測）", "触診", 9, 2, 3, 13),
    findingFrom("b", "b（実測）", "打診", 3, 5, 7, 5)
  ]));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.data.findings.length, 2);
});

console.log("== buildMesFinding: パネル所見への組み立て ==");
t("note が契約どおりの文面で自動生成される", () => {
  const r = okOf(panelJSON());
  const f = buildMesFinding(r.data.findings[0], r.data);
  assert.equal(f.note, "答え合わせノートの実測（病態あり12例・なし15例、TP9/FP2/FN3/TN13）");
  assert.equal(f.tag, "mes");
  assert.equal(f.cl, "mes:m_ef_fremitus_dec");
  assert.deepEqual(f.ss, [r.data.findings[0].sens, r.data.findings[0].spec]);
  assert.ok(!f.nsg);
});
t("補正入りは note に「ゼロセル補正あり」が付く", () => {
  const r = okOf(panelJSON({}, [findingFrom("x", "a（実測）", "触診", 9, 0, 3, 15, { corrected: true })]));
  const f = buildMesFinding(r.data.findings[0], r.data);
  assert.ok(f.note.includes("・ゼロセル補正あり"));
});
t("不成立の実測は nsg=1・nsgLabel「実測では判別できず」", () => {
  const r = okOf(panelJSON({}, [findingFrom("x", "a（実測）", "触診", 3, 5, 7, 5)]));
  const f = buildMesFinding(r.data.findings[0], r.data);
  assert.equal(f.nsg, 1);
  assert.equal(f.nsgLabel, "実測では判別できず");
});
t("一組の規律：表示頻度（ss）と EIG 頻度（LR 復元）の差が ±2% に収まる", () => {
  const r = okOf(panelJSON());
  const f = r.data.findings[0];
  const p = 0.2;
  const ppDisp = p * f.sens + (1 - p) * (1 - f.spec);           // 画面の「出る見込み」
  const spec2 = (f.lp - 1) / (f.lp - f.ln);                     // eigInputs の復元
  const sens2 = f.lp * (1 - spec2);
  const ppEig = p * sens2 + (1 - p) * (1 - spec2);
  assert.ok(Math.abs(ppDisp - ppEig) / ppDisp < 0.02,
    `disp ${ppDisp} vs eig ${ppEig}`);
});

console.log("== validatePersonalPanel: 拒否系 ==");
const rejects = (json, part, name) => t(name, () => {
  const r = okOf(json);
  assert.equal(r.ok, false, "受理されてしまった");
  assert.ok(r.reason.includes(part), `理由「${r.reason}」に「${part}」が無い`);
});
rejects("{壊れたJSON", "JSONとして読めない", "壊れた JSON を拒否");
rejects(panelJSON({ app: "other-app" }), "app が", "app 不一致を拒否");
rejects(panelJSON({ type: "panel" }), "type が", "type 不一致を拒否");
rejects(panelJSON({ version: 2 }), "version が 1 でない", "version≠1 を拒否");
rejects(panelJSON({ disease: { noteId: "x", bedsideKey: "xyz", label: "?" } }),
  "対応する病態がこのアプリにない", "未知の bedsideKey を拒否");
rejects(panelJSON({ n: { present: 12.5, absent: 15 } }), "正の整数でない", "n が整数でないのを拒否");
rejects(panelJSON({ n: { present: 0, absent: 15 } }), "正の整数でない", "n=0 を拒否");
rejects(panelJSON({}, []), "findings が空", "findings 空配列を拒否");
rejects(panelJSON({}, [
  findingFrom("dup", "a（実測）", "触診", 9, 2, 3, 13),
  findingFrom("dup", "b（実測）", "触診", 9, 2, 3, 13)
]), "重複", "所見 id の重複を拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { sens: 0 })]),
  "感度は 0 と 1 の間", "sens=0 を拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { spec: 1 })]),
  "特異度は 0 と 1 の間", "spec=1 を拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { lp: null })]),
  "有限の数でない", "lp が数でないのを拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { ln: 1 / 0 })]),
  "有限の数でない", "ln=Infinity を拒否（JSON 経由では null 化されるが直値でも守る）");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { lp: 5.2 })]),
  "±1%で整合しない", "lp が sens/spec と食い違う組（契約書の例示値 5.2 そのもの）を拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { ln: 0.5 })]),
  "±1%で整合しない", "ln が sens/spec と食い違う組を拒否");
rejects(panelJSON({}, [(() => {
  const f = findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13);
  f.counts = { tp: 9.5, fp: 2, fn: 3, tn: 13 };   // sens/spec/lp/ln は整合したまま counts だけ壊す
  return f;
})()]), "counts", "counts が整数でないとき拒否");
rejects(panelJSON({}, [(() => {
  const f = findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13);
  f.counts = { tp: 9, fp: -2, fn: 3, tn: 13 };
  return f;
})()]), "counts", "counts が負のとき拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { ci: [5, 2] })]),
  "ci が", "ci の下限>上限を拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { cin: [0.1] })]),
  "cin が", "cin の要素数不足を拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "", "触診", 9, 2, 3, 13))]),
  "所見名", "nm 空を拒否");
rejects(panelJSON({}, [Object.assign(findingFrom("x", "a（実測）", "触診", 9, 2, 3, 13), { id: "" })]),
  "id がない", "id 空を拒否");

console.log("== parseCustomParam: 共有リンク c= の検証 ==");
const enc = (v) => encodeURIComponent(JSON.stringify(v));
t("6要素（id つき）は id を保存して復元する", () => {
  const out = parseCustomParam(enc([["自作所見", 4.0, 0.5, "clA", "聴診", "u1723190000000"]]));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "u1723190000000");
  assert.equal(out[0].tag, "own");
});
t("5要素（旧リンク）は従来どおり u+連番で採番する", () => {
  const out = parseCustomParam(enc([["旧リンクの所見", 3.0, 0.4, "clB", "打診"]]));
  assert.equal(out[0].id, "u0");
});
t("LR+ ≤ 1 の要素は捨てる（エディタと同じ検証）", () => {
  const out = parseCustomParam(enc([["不正", 0.9, 0.5, "c", "x", "u1"], ["正常", 2.0, 0.5, "c", "x", "u2"]]));
  assert.equal(out.length, 1);
  assert.equal(out[0].nm, "正常");
});
t("LR− が 0〜1 の外の要素は捨てる", () => {
  const out = parseCustomParam(enc([["不正", 2.0, 1.5, "c", "x", "u1"], ["不正2", 2.0, "abc", "c", "x", "u3"]]));
  assert.equal(out.length, 0);
});
t("組み込み所見の id を名乗る細工（id: 'gest' 等）は採番し直す", () => {
  const out = parseCustomParam(enc([["細工", 2.0, 0.5, "c", "x", "gest"]]));
  assert.equal(out[0].id, "u0");
});
t("id 重複は接尾辞で衝突回避する", () => {
  const out = parseCustomParam(enc([["a", 2.0, 0.5, "c", "x", "u7"], ["b", 3.0, 0.5, "c", "x", "u7"]]));
  assert.equal(out.length, 2);
  assert.notEqual(out[0].id, out[1].id);
});
t("JSON でない c= は空配列を返す（例外を投げない）", () => {
  assert.deepEqual(parseCustomParam("%7Bbroken"), []);
});
t("配列でない c= は空配列を返す", () => {
  assert.deepEqual(parseCustomParam(enc({ a: 1 })), []);
});

console.log("");
if (failed) { console.error(failed + " 件失敗 / 全" + n + "件"); process.exit(1); }
console.log("全 " + n + " 件合格");
