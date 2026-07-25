# ベイズ診察エンジン — Bedside Bayes Engine

身体診察の価値を、尤度比・期待情報利得・到達可能域の3つで可視化する教育用ウェブアプリ。
事前確率に所見を積んで事後確率の軌跡を描き、**まだ取っていない所見を全部取ったときに到達しうる確率の分布**まで計算する。
「この診察は結論を変えるのか」に、その場で数量で答えるためのもの。

- 依存ライブラリなし・ビルド不要・通信なし（`index.html` 単体でも動く）
- PWA 対応（ホーム画面に追加すればオフラインで起動）
- 設定と所見の状態が URL に入るので、**症例そのものをリンクで配れる**
- 対象：市中肺炎／胸水／急性心不全（救急外来の呼吸困難）／気流閉塞（COPD）

---

## 公開手順

### 1. 3か所を自分の情報に置き換える

```bash
sed -i '' -e 's/（あなたの名前）/山田 太郎/g' \
          -e 's#https://USERNAME.github.io/bedside-bayes/#https://your-account.github.io/bedside-bayes/#g' \
          -e 's/（連絡先メールまたはフォームURL）/you@example.com/g' index.html
```

（Linux の sed は `-i ''` ではなく `-i` のみ）

### 2. どれか一つで公開する

**GitHub Pages（推奨・無料・独自ドメイン可）**

```bash
git init && git add -A && git commit -m "ベイズ診察エンジン v1.0.0"
git branch -M main
git remote add origin git@github.com:your-account/bedside-bayes.git
git push -u origin main
# GitHub の Settings → Pages → Source: main / (root) を選ぶ
```

数分で `https://your-account.github.io/bedside-bayes/` が生きる。`.nojekyll` は同梱済み。

**Netlify / Cloudflare Pages** — このフォルダをドラッグ&ドロップするだけ。ビルドコマンドは空欄。

**院内イントラネット / 配布** — `index.html` を単体でコピーすれば動く。Service Worker と PWA は無効になるが、計算機能はすべて残る。USB でも共有フォルダでも可。

### 3. 公開後に確認する

- [ ] スマートフォンで開いて横スクロールが出ないか
- [ ] リンク共有ボタンで出た URL を別端末で開き、所見の状態が再現されるか
- [ ] SNS に貼ってカード画像（`icons/ogp.png`）が出るか
- [ ] 「ホーム画面に追加」後、機内モードで起動するか
- [ ] 免責・出典・連絡先が自分の意図どおりか

---

## ファイル構成

```
index.html            アプリ本体（HTML/CSS/JS すべて内包）
manifest.webmanifest  PWA 定義
sw.js                 オフライン用 Service Worker（更新時は VERSION を上げる）
icons/                アイコンと OGP 画像
.nojekyll             GitHub Pages で Jekyll 処理を止める
```

---

## 計算の中身

| 項目 | 式 | 備考 |
|---|---|---|
| 事後オッズ | 事前オッズ × ΠLR | 相関補正 κ を適用 |
| 相関補正 | 同一クラスタの n 番目の所見を `logLR × κⁿ` に減衰 | κ=1 で素朴ベイズ |
| 感度・特異度の復元 | `spec=(LR⁺−1)/(LR⁺−LR⁻)`, `sens=LR⁺(1−spec)` | 分岐確率の計算に使用 |
| 期待情報利得 | `H(p) − [P(+)H(p₊) + P(−)H(p₋)]` | 単位 bit、H は2値エントロピー |
| 到達可能域 | 未実施 n 所見の 2ⁿ 分岐を全列挙 | 各分岐の生起確率で重み付け |

**最大の前提は所見間の条件付き独立。** 濁音・気管支呼吸音・ヤギ音のような同一機序の所見の尤度比を掛け算してよいかは未解決で、JAMA Rational Clinical Examination も同じ留保をつけている。κ スライダーはその感度分析にあたる。κ を動かすと壊れる結論は、もともと脆い。

---

## 尤度比の出典と信頼度

各所見には4種のバッジが付く。

| バッジ | 意味 | 教材への使い方 |
|---|---|---|
| 出典 | 原著の報告値そのまま | そのまま使える |
| 導出 | 報告された感度・特異度から計算 | そのまま使える |
| 推定 | 報告値がなく、所見の性質から置いた仮値 | **差し替え推奨** |
| 要確認 | 広く流通しているが一次文献を確認しきれていない値 | **差し替え必須** |

主要な出典：

- Ebell MH, et al. *Accuracy of Signs and Symptoms for the Diagnosis of Community-acquired Pneumonia: A Meta-analysis.* Acad Emerg Med. 2020;27(7):541-553.
- Metlay JP, Kapoor WN, Fine MJ. *Does this patient have community-acquired pneumonia?* JAMA. 1997;278(17):1440-5.
- Wong CL, Holroyd-Leduc J, Straus SE. *Does this patient have a pleural effusion?* JAMA. 2009;301(3):309-317.
- Wang CS, et al. *Does this dyspneic patient in the emergency department have congestive heart failure?* JAMA. 2005;294(15):1944-56.
- Straus SE, et al. *Diagnosis of obstructive airways disease from the clinical examination.* J Gen Intern Med.
- Holleman DR Jr, Simel DL. *Does the clinical examination predict airflow limitation?* JAMA. 1995;273(4):313-9.
- McGee S. *Evidence-Based Physical Diagnosis.*

尤度比の数値そのものは各原著論文に帰属する。

## 所見パネルを自分のものにする

アプリ内の「＋ 所見を追加・LRを差し替える」から、所見名・LR+・LR−・機序クラスタを入力すれば即座に計算に入る。作ったパネルは JSON で書き出せる。
恒久的に組み込むなら `index.html` 内の `const DB = {...}` を直接編集する。疾患を1つ足すのは、`DB` にキーを1つ増やすだけで済む。

```js
mydisease: {
  name:"表示名", short:"タブ名", pre:0.2, tTest:5, tTreat:70,
  ctx:"どんな患者集団を想定しているか",
  src:["出典1","出典2"],
  f:[{ id:"a1", cat:"聴診", nm:"所見名", lp:6.2, ln:0.9,
       cl:"機序クラスタ名", tag:"src", note:"補足", ltag:"est" }],
  cases:[{ t:"症例名", d:"説明", pre:0.3, set:{a1:1} }]
}
```

`tag` は `src` / `der` / `est` / `chk`、`ltag` は LR− 側のバッジ（省略可）。`cl` が同じ所見どうしが相関補正の対象になる。

---

## ライセンス

- コード：MIT License（`LICENSE` 参照）
- 解説文・パネル定義：CC BY 4.0
- 尤度比の数値：各原著論文に帰属

## 免責

本ツールは確率的推論を学ぶための教育用シミュレータであり、診断・治療の判断を代替しない。表示される確率は、公表された尤度比を条件付き独立と仮定して合成した推計値である。個々の患者への適用の可否と結果の解釈は、使用者自身の臨床判断と責任に属する。

入力内容は端末内でのみ処理され、外部に送信されない。サーバ保存・アクセス解析・広告・Cookie のいずれも使用していない。**患者識別情報は入力しないこと。**

## 更新履歴

- v1.0.0 — 初版。4疾患、確率軌跡、期待情報利得ランキング、到達可能域、相関補正、URL共有、PWA。
