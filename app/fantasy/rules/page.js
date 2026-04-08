import Link from 'next/link'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px', paddingBottom: 8, borderBottom: '1px solid var(--border-color)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Table({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '8px 12px', textAlign: i === 0 ? 'left' : 'center',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)',
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'var(--bg-tertiary)' : 'transparent' }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '9px 12px', textAlign: j === 0 ? 'left' : 'center',
                  color: typeof cell === 'object' ? cell.color : 'var(--text-primary)',
                  fontWeight: typeof cell === 'object' ? cell.weight ?? 400 : 400,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  whiteSpace: 'nowrap',
                }}>
                  {typeof cell === 'object' ? cell.label : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Card({ children }) {
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '14px 16px', marginBottom: 12 }}>
      {children}
    </div>
  )
}

const pt = (n) => ({ label: n > 0 ? `+${n}pt` : `${n}pt`, color: n > 0 ? 'var(--accent)' : n < 0 ? '#ff6b6b' : 'var(--text-secondary)', weight: 700 })
const yen = (n) => ({ label: n > 0 ? `+${n.toLocaleString()}万` : `${n.toLocaleString()}万`, color: n > 0 ? 'var(--accent)' : n < 0 ? '#ff6b6b' : 'var(--text-secondary)', weight: 700 })

export default function RulesPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 60 }}>

      {/* ヘッダー */}
      <div style={{ marginBottom: 36 }}>
        <Link href="/fantasy" style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', letterSpacing: '0.08em' }}>← Fantasy TOP</Link>
        <p style={{ fontSize: 12, letterSpacing: '0.15em', color: 'var(--text-secondary)', margin: '16px 0 8px', textTransform: 'uppercase' }}>Fantasy J.League</p>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>ルール &amp; ガイド</h1>
      </div>

      {/* 概要 */}
      <Section title="ファンタジーサッカーとは">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, margin: 0 }}>
          J1リーグの実際の試合結果をもとに選手がポイントを獲得するゲームです。自分だけのクラブを作り、15人のスカッドを編成。毎節のスタメン11人が稼いだポイントの合計で他のユーザーと競います。選手のパフォーマンスによって移籍金が変動するため、安くていい選手を早めに獲得することが重要です。
        </p>
      </Section>

      {/* スカッド編成 */}
      <Section title="スカッド編成ルール">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: '初期予算', value: '10億円' },
            { label: 'スカッド人数', value: '15〜18人' },
            { label: '同クラブ上限', value: '3人まで' },
            { label: 'スタメン人数', value: '11人' },
          ].map(({ label, value }) => (
            <div key={label} style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
        <Table
          headers={['ポジション', '最大人数', 'スタメン最小']}
          rows={[
            ['GK（ゴールキーパー）', '2人', '1人'],
            ['DF（ディフェンダー）', '6人', '3人'],
            ['MF（ミッドフィールダー）', '6人', '2人'],
            ['FW（フォワード）', '4人', '1人'],
          ]}
        />
      </Section>

      {/* スタメン・締め切り */}
      <Section title="スタメン &amp; 締め切り">
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: 4 }}>スタメン締め切り</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>GW初戦キックオフの<span style={{ color: 'var(--accent)' }}>3時間前</span></div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: 4 }}>移籍市場オープン</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>GW最終戦翌日の<span style={{ color: 'var(--accent)' }}>正午12:00</span></div>
            </div>
          </div>
        </Card>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0', lineHeight: 1.7 }}>
          締め切り後はスタメン変更・移籍が不可になります。GW期間中は変更できません。
        </p>
      </Section>

      {/* キャプテン */}
      <Section title="キャプテン">
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#fffc2b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#000' }}>C</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fffc2b', marginBottom: 3 }}>キャプテンのポイントは2倍</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                スタメン11人の中から1人をキャプテンに指定できます。そのGWで獲得したポイントが2倍になります（マイナスポイントも2倍）。出場0分の場合は0pt。スタメン編集ページで指定できます。
              </div>
            </div>
          </div>
        </Card>
      </Section>

      {/* ポイント計算 */}
      <Section title="ポイント計算">

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '0 0 8px', textTransform: 'uppercase' }}>出場時間</h3>
        <Table
          headers={['条件', 'ポイント']}
          rows={[
            ['90分出場', pt(3)],
            ['60〜89分出場', pt(2)],
            ['1〜59分出場', pt(1)],
          ]}
        />

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '20px 0 8px', textTransform: 'uppercase' }}>チーム結果</h3>
        <Table
          headers={['条件', 'ポイント']}
          rows={[
            ['勝利', pt(2)],
          ]}
        />

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '20px 0 8px', textTransform: 'uppercase' }}>攻撃</h3>
        <Table
          headers={['条件', 'GK', 'DF', 'MF', 'FW']}
          rows={[
            ['ゴール（1点につき）', pt(6), pt(4), pt(4), pt(6)],
            ['アシスト（1本につき）', pt(5), pt(4), pt(4), pt(4)],
            ['キーパス 2本以上', '—', '—', pt(1), pt(1)],
            ['キーパス 4本以上', '—', '—', pt(2), pt(2)],
            ['キーパス 6本以上', '—', '—', pt(3), pt(3)],
          ]}
        />

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '20px 0 8px', textTransform: 'uppercase' }}>守備</h3>
        <Table
          headers={['条件', 'GK', 'DF', 'MF', 'FW']}
          rows={[
            ['クリーンシート（90分出場）', pt(3), pt(3), pt(1), '—'],
            ['2失点', pt(-1), pt(-1), '—', '—'],
            ['3失点', pt(-2), pt(-2), '—', '—'],
            ['4失点以上', pt(-3), pt(-3), '—', '—'],
            ['セーブ 2本以上', pt(1), '—', '—', '—'],
            ['セーブ 4本以上', pt(2), '—', '—', '—'],
            ['セーブ 6本以上', pt(3), '—', '—', '—'],
            ['守備アクション合計 4以上*', pt(3), pt(3), pt(3), pt(3)],
          ]}
        />
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0' }}>* タックル＋インターセプト＋ブロックの合計</p>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '20px 0 8px', textTransform: 'uppercase' }}>個人スタッツ</h3>
        <Table
          headers={['条件', 'ポイント']}
          rows={[
            ['デュエル勝利 5回以上', pt(1)],
            ['デュエル勝利 8回以上', pt(2)],
            ['ファウルを受ける 4回以上', pt(1)],
            ['パス成功率 90%以上（30本以上試みた場合）', pt(1)],
          ]}
        />

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '20px 0 8px', textTransform: 'uppercase' }}>レーティング</h3>
        <Table
          headers={['条件', 'ポイント']}
          rows={[
            ['レーティング 7.0以上', pt(1)],
            ['レーティング 7.5以上', pt(2)],
            ['レーティング 8.0以上', pt(3)],
          ]}
        />

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '20px 0 8px', textTransform: 'uppercase' }}>ペナルティ</h3>
        <Table
          headers={['条件', 'ポイント']}
          rows={[
            ['イエローカード', pt(-1)],
            ['レッドカード', pt(-4)],
            ['PKミス', pt(-3)],
          ]}
        />
      </Section>

      {/* MOP */}
      <Section title="Most Outstanding Player">
        <Card>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}>
            GWで最もポイントを獲得した選手には、通常の価格変動に加えてボーナスが付与されます（同点の場合は全員対象）。
          </p>
          <Table
            headers={['順位', '移籍金ボーナス']}
            rows={[
              ['1位', yen(1000)],
              ['2〜5位', yen(500)],
            ]}
          />
        </Card>
      </Section>

      {/* 移籍金変動 */}
      <Section title="移籍金変動">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>
          各GW終了後、選手のポイントに応じて移籍金が変動します。低額の選手は上昇幅が大きく、高額の選手は上昇しにくい設計です。
        </p>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '0 0 8px', textTransform: 'uppercase' }}>ポイント → 基本変動額</h3>
        <Table
          headers={['GWポイント', '変動額']}
          rows={[
            ['12pt以上', yen(2000)],
            ['10〜11pt', yen(1200)],
            ['8〜9pt', yen(600)],
            ['6〜7pt', yen(300)],
            ['4〜5pt', yen(0)],
            ['2〜3pt', yen(-300)],
            ['0〜1pt', yen(-700)],
            ['-1pt以下', yen(-1200)],
            ['不出場（GW対象チーム）', yen(-800)],
          ]}
        />

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '20px 0 8px', textTransform: 'uppercase' }}>価格帯による上昇補正（下落は補正なし）</h3>
        <Table
          headers={['現在の移籍金', '上昇倍率']}
          rows={[
            ['〜2,000万', { label: '×1.8', color: '#4caf50', weight: 700 }],
            ['2,001〜4,000万', { label: '×1.4', color: '#81c784', weight: 700 }],
            ['4,001〜7,000万', { label: '×1.0', color: 'var(--text-primary)', weight: 700 }],
            ['7,001〜10,000万', { label: '×0.7', color: 'var(--text-secondary)', weight: 700 }],
            ['10,001万〜', { label: '×0.5', color: '#888', weight: 700 }],
          ]}
        />
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0 0', lineHeight: 1.6 }}>
          例）移籍金1,000万円の選手が12pt以上獲得 → 基本+2,000万 × 1.8 = <span style={{ color: 'var(--accent)', fontWeight: 700 }}>+3,600万円</span>
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0' }}>最低移籍金：1,000万円（下限あり）</p>
      </Section>

      {/* 移籍市場 */}
      <Section title="移籍市場">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}>
          選手の売買は移籍市場がオープンしている期間のみ可能です。
        </p>
        <Table
          headers={['操作', '条件']}
          rows={[
            ['選手売却', '売却額 = 購入額の95%'],
            ['同クラブから同時保有', '最大3人まで'],
          ]}
        />
      </Section>

    </div>
  )
}
