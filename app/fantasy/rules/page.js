import Link from 'next/link'

function Section({ title, label, children }) {
  return (
    <div style={{ marginBottom: 48 }}>
      {label && (
        <p style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--accent)', textTransform: 'uppercase', margin: '0 0 6px', fontWeight: 700 }}>{label}</p>
      )}
      <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 20px' }}>{title}</h2>
      {children}
    </div>
  )
}

function Table({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border-color)', marginBottom: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '9px 14px', textAlign: i === 0 ? 'left' : 'center',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--text-secondary)', backgroundColor: '#111',
                borderBottom: '1px solid var(--border-color)',
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#161616' : '#111' }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '10px 14px', textAlign: j === 0 ? 'left' : 'center',
                  color: typeof cell === 'object' ? cell.color : 'var(--text-primary)',
                  fontWeight: typeof cell === 'object' ? (cell.weight ?? 400) : 400,
                  borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
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

function Tip({ title, children }) {
  return (
    <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 14, marginTop: 16 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 4, textTransform: 'uppercase' }}>{title}</div>}
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>{children}</p>
    </div>
  )
}

function InfoGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
      {items.map(({ label, value, sub }) => (
        <div key={label} style={{ backgroundColor: '#161616', border: '1px solid var(--border-color)', borderRadius: 6, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
        </div>
      ))}
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#000' }}>{n}</span>
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>{children}</p>
      </div>
    </div>
  )
}

const pt = (n) => ({ label: n > 0 ? `+${n}` : `${n}`, color: n > 0 ? '#4caf50' : n < 0 ? '#ef5350' : 'var(--text-secondary)', weight: 700 })
const yen = (n, note) => ({ label: (n > 0 ? `+${n.toLocaleString()}万` : `${n.toLocaleString()}万`) + (note ? `　${note}` : ''), color: n > 0 ? '#4caf50' : n < 0 ? '#ef5350' : 'var(--text-secondary)', weight: 700 })
const mul = (x, color) => ({ label: `×${x}`, color, weight: 700 })

export default function RulesPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', paddingBottom: 80 }}>

      {/* ヘッダー */}
      <div style={{ marginBottom: 48, paddingTop: 8 }}>
        <Link href="/fantasy" style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', letterSpacing: '0.08em' }}>← Fantasy TOP</Link>
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.2em', color: 'var(--accent)', textTransform: 'uppercase', margin: '0 0 8px', fontWeight: 700 }}>Manager's Handbook</p>
          <h1 style={{ fontSize: 40, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 16px', lineHeight: 1.1 }}>Fantasy J.League<br />完全ガイド</h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8, maxWidth: 560 }}>
            あなたはJ1リーグに参戦するファンタジークラブの監督です。限られた予算でスカッドを編成し、毎節のスタメンが稼ぐポイントで他の監督たちと競います。安い選手を発掘し、移籍金の上昇を読み、最高のクラブを作り上げてください。
          </p>
        </div>
      </div>

      {/* はじめ方 */}
      <Section label="Getting Started" title="監督就任までの流れ">
        <Step n="1" title="クラブを設立する">
          監督名・クラブ名・クラブカラーを決めて登録します。あなただけのクラブが誕生します。
        </Step>
        <Step n="2" title="初期スカッド15人を編成する">
          初期予算10億円でJ1リーグの選手を15人獲得します。ポジション構成と予算配分が最初の重要な決断です。
        </Step>
        <Step n="3" title="スタメン11人とキャプテンを選ぶ">
          毎節の試合前までに、スタメン11人とキャプテン1人を決定します。この11人の実際の試合成績がポイントに変換されます。
        </Step>
        <Step n="4" title="移籍市場で戦力を強化する">
          GW終了後に移籍市場がオープン。選手を売却・獲得してスカッドを改善し続けます。選手の移籍金は毎節の成績に応じて変動します。
        </Step>
      </Section>

      {/* スカッド編成 */}
      <Section label="Squad Building" title="スカッド編成">
        <InfoGrid items={[
          { label: '初期予算', value: '10億円' },
          { label: 'スカッド人数', value: '15〜18人' },
          { label: 'スタメン', value: '11人' },
          { label: '同クラブ上限', value: '3人' },
        ]} />
        <Table
          headers={['ポジション', 'スカッド上限', 'スタメン最小', '選手の特徴']}
          rows={[
            ['GK ゴールキーパー', '2人', '1人', 'セーブ・クリーンシートで高得点'],
            ['DF ディフェンダー', '6人', '3人', 'クリーンシート・守備アクションが鍵'],
            ['MF ミッドフィールダー', '6人', '2人', 'キーパスやゴール関与で安定した得点'],
            ['FW フォワード', '4人', '1人', 'ゴールで一気に高得点。ハイリスク・ハイリターン'],
          ]}
        />
        <Tip title="編成のコツ">
          安い選手（〜2,000万円台）は好パフォーマンス時の移籍金上昇率が1.8倍と高いため、若手・伸び盛りの選手を早期に獲得できると有利です。予算を温存しておくと移籍市場での機動力が上がります。
        </Tip>
      </Section>

      {/* 締め切り */}
      <Section label="Deadline & Market" title="移籍市場と締め切り">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ backgroundColor: '#161616', border: '1px solid var(--border-color)', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: 8 }}>DEADLINE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>GW初戦の3時間前</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>この時刻までにスタメン・移籍を確定させてください。締め切り後はGW終了まで変更不可。</div>
          </div>
          <div style={{ backgroundColor: '#161616', border: '1px solid var(--border-color)', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: 8 }}>MARKET OPEN</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>GW最終戦翌日の正午</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>全試合終了の翌日12:00に移籍市場が再開。次のGWの締め切りまで自由に売買できます。</div>
          </div>
        </div>
        <Table
          headers={['操作', 'ルール']}
          rows={[
            ['選手の売却', '売却額 = 購入額の95%（移籍金変動後の現在額ではなく購入時の額が基準）'],
            ['選手の獲得', '現在の移籍金を全額支払い。予算に余裕がないと好選手を逃す'],
            ['同クラブの選手', '同じクラブから最大3人まで保有可能'],
          ]}
        />
        <Tip title="移籍市場の戦略">
          移籍市場のオープン直後は他の監督も動きます。狙っている選手がいれば早めに確保しましょう。また売却後に予算を確保した状態で市場を眺めると、想定外のお買い得選手を見つけることがあります。
        </Tip>
      </Section>

      {/* キャプテン */}
      <Section label="Captain" title="キャプテン制度">
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, backgroundColor: '#161616', border: '1px solid #fffc2b33', borderRadius: 6, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#fffc2b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#000' }}>C</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fffc2b' }}>ポイント2倍</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>
              スタメン11人から1人をキャプテンに指定。そのGWで獲得したポイントが2倍になります（マイナスも2倍）。出場0分の場合は0ptのまま。
            </p>
          </div>
        </div>
        <Tip title="キャプテン選びの考え方">
          ホームゲームの得点源FW・好調MFなど、高得点が期待できる試合に出場する選手を選びましょう。アウェー連戦中のチームの選手はリスクが高めです。迷ったときは主力FWが無難です。
        </Tip>
      </Section>

      {/* ポイント */}
      <Section label="Points System" title="ポイント計算">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.8 }}>
          選手ポイントはJ1リーグの実際のスタッツをもとに自動計算されます。試合終了から最大2時間でポイントが反映されます。
        </p>

        <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#111' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', width: '40%' }}>条件</th>
                {['GK','DF','MF','FW'].map(pos => (
                  <th key={pos} style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>{pos}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { cat: '出場時間', rows: [
                  ['90分出場', [3,3,3,3]],
                  ['60〜89分出場', [2,2,2,2]],
                  ['1〜59分出場', [1,1,1,1]],
                ]},
                { cat: 'チーム成績', rows: [
                  ['勝利', [2,2,2,2]],
                ]},
                { cat: '攻撃', rows: [
                  ['ゴール（1点）', [6,4,4,6]],
                  ['アシスト（1本）', [5,4,4,4]],
                  ['キーパス 2本以上', [null,null,1,1]],
                  ['キーパス 4本以上', [null,null,2,2]],
                  ['キーパス 6本以上', [null,null,3,3]],
                ]},
                { cat: '守備', rows: [
                  ['クリーンシート（90分）', [3,3,1,null]],
                  ['2失点', [-1,-1,null,null]],
                  ['3失点', [-2,-2,null,null]],
                  ['4失点以上', [-3,-3,null,null]],
                  ['セーブ 2本以上', [1,null,null,null]],
                  ['セーブ 4本以上', [2,null,null,null]],
                  ['セーブ 6本以上', [3,null,null,null]],
                  ['守備アクション 4以上 ※', [3,3,3,3]],
                ]},
                { cat: '個人スタッツ', rows: [
                  ['デュエル勝利 5回以上', [1,1,1,1]],
                  ['デュエル勝利 8回以上', [2,2,2,2]],
                  ['ファウルを受ける 4回以上', [1,1,1,1]],
                  ['パス成功率 90%以上（30本〜）', [1,1,1,1]],
                ]},
                { cat: 'レーティング', rows: [
                  ['8.0以上', [3,3,3,3]],
                  ['7.5以上', [2,2,2,2]],
                  ['7.0以上', [1,1,1,1]],
                ]},
                { cat: 'ペナルティ', rows: [
                  ['イエローカード', [-1,-1,-1,-1]],
                  ['レッドカード', [-4,-4,-4,-4]],
                  ['PKミス', [-3,-3,-3,-3]],
                ]},
              ].flatMap(({ cat, rows }, gi) =>
                rows.map(([ label, vals ], ri) => {
                  const isFirst = ri === 0
                  const totalRows = rows.length
                  const bg = gi % 2 === 0 ? '#161616' : '#131313'
                  return (
                    <tr key={`${gi}-${ri}`} style={{ backgroundColor: bg }}>
                      {isFirst && (
                        <td rowSpan={totalRows} style={{
                          padding: '0 14px',
                          fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
                          color: 'var(--accent)', backgroundColor: '#0e0e0e',
                          borderRight: '1px solid var(--border-color)',
                          borderBottom: '1px solid var(--border-color)',
                          verticalAlign: 'middle', whiteSpace: 'nowrap',
                          writingMode: 'vertical-rl', textOrientation: 'mixed',
                          width: 28,
                        }}>{cat}</td>
                      )}
                      <td style={{ padding: '9px 14px', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>{label}</td>
                      {vals.map((v, vi) => (
                        <td key={vi} style={{
                          padding: '9px 14px', textAlign: 'center',
                          fontWeight: v !== null ? 700 : 400,
                          color: v === null ? '#2a2a2a' : v > 0 ? '#4caf50' : v < 0 ? '#ef5350' : 'var(--text-secondary)',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          fontSize: 13,
                        }}>
                          {v === null ? '—' : v > 0 ? `+${v}` : v}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0' }}>※ タックル＋インターセプト＋ブロックの合計</p>
      </Section>

      {/* MOP */}
      <Section label="Weekly Award" title="Most Outstanding Player">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.8 }}>
          毎GW、最もポイントを獲得した選手に「MOP（最優秀選手）ボーナス」として移籍金が上乗せされます。同点の場合は全員が対象。この賞を受賞した選手の移籍金は急騰するため、早めの獲得が重要です。
        </p>
        <Table
          headers={['順位', '移籍金ボーナス']}
          rows={[
            ['1位', yen(1000)],
            ['2〜5位', yen(500)],
          ]}
        />
      </Section>

      {/* 移籍金変動 */}
      <Section label="Transfer Value" title="移籍金変動システム">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.8 }}>
          GW終了後、すべての選手の移籍金がそのGWのポイントに応じて変動します。好パフォーマンスの選手は値上がり、不調・不出場の選手は値下がりします。低価格帯の選手ほど上昇幅が大きいため、安くて活躍する選手の発掘が攻略の鍵です。
        </p>

        {/* マトリクス表 */}
        <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border-color)', marginBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ backgroundColor: '#0e0e0e' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', letterSpacing: '0.1em' }}>GWポイント</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', letterSpacing: '0.1em', borderRight: '1px solid var(--border-color)' }}>基本変動</th>
                {[['〜2,000万','×1.8'],['〜4,000万','×1.4'],['〜7,000万','×1.0'],['〜1億','×0.7'],['1億〜','×0.5']].map(([price, rate]) => (
                  <th key={price} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{price}</div>
                    <div style={{ color: 'var(--accent)', fontSize: 11 }}>{rate}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: '12pt以上', base: 2000, note: '上位3%', rates: [1.8,1.4,1.0,0.7,0.5] },
                { label: '10〜11pt', base: 1200, note: '上位8%', rates: [1.8,1.4,1.0,0.7,0.5] },
                { label: '8〜9pt', base: 600, note: '上位15%', rates: [1.8,1.4,1.0,0.7,0.5] },
                { label: '6〜7pt', base: 300, note: '上位30%', rates: [1.8,1.4,1.0,0.7,0.5] },
                { label: '4〜5pt', base: 0, note: '平均帯', rates: [1.8,1.4,1.0,0.7,0.5] },
                { label: '2〜3pt', base: -300, rates: null },
                { label: '0〜1pt', base: -700, rates: null },
                { label: '-1pt以下', base: -1200, rates: null },
                { label: '不出場', base: -800, rates: null },
              ].map(({ label, base, note, rates }, i) => {
                const isRise = base > 0
                const isZero = base === 0
                const bg = i % 2 === 0 ? '#161616' : '#131313'
                const baseColor = isZero ? 'var(--text-secondary)' : isRise ? '#4caf50' : '#ef5350'
                return (
                  <tr key={label} style={{ backgroundColor: bg }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {label}
                      {note && <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>{note}</span>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: baseColor, borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                      {base === 0 ? '±0' : base > 0 ? `+${base.toLocaleString()}万` : `${base.toLocaleString()}万`}
                    </td>
                    {rates ? rates.map((r, ri) => {
                      const val = base === 0 ? 0 : Math.round(base * r)
                      return (
                        <td key={ri} style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: val > 0 ? '#4caf50' : val < 0 ? '#ef5350' : 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {val === 0 ? '±0' : val > 0 ? `+${val.toLocaleString()}万` : `${val.toLocaleString()}万`}
                        </td>
                      )
                    }) : (
                      <td colSpan={5} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        下落額は価格帯に関係なく一定
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <Tip title="移籍金変動の読み方">
          好パフォーマンスが続く選手の移籍金はどんどん上昇します。移籍金が上がりすぎた選手を売却して安い新星に切り替えるサイクルが、長期的な戦略のポイントです。
        </Tip>
      </Section>

    </div>
  )
}
