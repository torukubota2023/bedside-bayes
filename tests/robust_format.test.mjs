/* 「結論の頑健性」の表記の純関数のテスト（v2.17.0）。
   index.html の ROBUSTPURE マーカー区間を切り出して node で実行する。
   実行: node tests/robust_format.test.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const a = html.indexOf("/* ROBUSTPURE:BEGIN"), b = html.indexOf("/* ROBUSTPURE:END */");
if (a < 0 || b < 0 || b <= a) throw new Error("マーカーが見つからない: ROBUSTPURE");
const { fmtMg, pctIn, pplOf, pplPair } = new Function(
  html.slice(a, b) + "\nreturn {fmtMg, pctIn, pplOf, pplPair};")();

let n = 0, failed = 0;
function t(name, fn) {
  n++;
  try { fn(); console.log("  ok " + String(n).padStart(2) + "  " + name); }
  catch (e) { failed++; console.error("FAIL " + String(n).padStart(2) + "  " + name + "\n      " + e.message); }
}

console.log("== fmtMg: 余裕の倍率 ==");
t("2倍未満は、丸めても 2.0 と書かない（基準 2倍以上で ✓ と食い違わない）", () => {
  assert.equal(fmtMg(1.96), "1.9");
  assert.equal(fmtMg(1.999), "1.9");
  assert.equal(fmtMg(2.0), "2.0");
  assert.equal(fmtMg(1.7), "1.7");
  assert.equal(fmtMg(8.14), "8.1");
});

console.log("== pctIn: 両側の範囲は内側へ丸める ==");
t("下は切り上げ・上は切り下げ（10%以上は整数）", () => {
  assert.equal(pctIn(0.1611, true), "17");
  assert.equal(pctIn(0.5799, false), "57");
  assert.equal(pctIn(0.13, true), "13");      // ちょうどなら動かさない
  assert.equal(pctIn(0.57, false), "57");
});
t("10%未満は小数1桁で内側へ", () => {
  assert.equal(pctIn(0.0605, true), "6.1");
  assert.equal(pctIn(0.0605, false), "6.0");
});
t("丸めた値は必ず範囲の内側にある（総当たり）", () => {
  for (let i = 1; i < 999; i++) {
    const v = i / 1000 + 0.00037;
    const up = parseFloat(pctIn(v, true)) / 100, dn = parseFloat(pctIn(v, false)) / 100;
    assert.ok(up >= v - 1e-12, "切り上げが下に出た " + v);
    assert.ok(dn <= v + 1e-12, "切り下げが上に出た " + v);
  }
});

console.log("== pplOf / pplPair: 表示した％と人数を一致させる ==");
t("整数の％は 100人のうち", () => assert.deepEqual(pplOf("13"), { den: 100, n: "13人" }));
t("小数の付く％は 1000人のうち（6.1% → 61人）", () => assert.deepEqual(pplOf("6.1"), { den: 1000, n: "61人" }));
t("<0.1 は 1000人のうち 1人未満", () => assert.deepEqual(pplOf("<0.1"), { den: 1000, n: "1人未満" }));
t("分母が違う2つは 1000人にそろえる（6.1% と 57%）", () =>
  assert.deepEqual(pplPair("6.1", "57"), { den: 1000, a: "61人", b: "570人" }));
t("同じ分母ならそのまま", () => assert.deepEqual(pplPair("13", "57"), { den: 100, a: "13人", b: "57人" }));

console.log("\n" + (failed ? failed + " 件失敗" : "全 " + n + " 件合格") + " / 全" + n + "件");
if (failed) process.exit(1);
