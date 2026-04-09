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

function Table({ headers, rows, colAlignments }) {
  const getAlign = (i) => colAlignments?.[i] ?? (i === 0 ? 'left' : 'center')
  return (
    <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border-color)', marginBottom: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '9px 14px', textAlign: getAlign(i),
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
                  padding: '10px 14px', textAlign: getAlign(j),
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
            あなたはJ1リーグに参戦するファンタジークラブの監督です。<br />
            限られた予算でスカッドを編成し、毎節のスタメンが稼ぐポイントで他の監督たちと競います。<br />
            若い才能を発掘し、移籍金の上昇を読み、最高のクラブを作り上げてください。
          </p>
        </div>
      </div>

      {/* はじめ方 */}
      <Section label="Getting Started" title="監督就任までの流れ">
        <Step n="1" title="クラブを設立する">
          監督名・クラブ名・クラブカラーを決めて登録します。あなただけのクラブが誕生します。
        </Step>
        <Step n="2" title="初期スカッドを15-20人で編成する">
          初期予算10億円でJ1リーグの選手を15-20人獲得します。ポジション構成と予算配分が最初の重要な決断です。
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
          { label: 'スカッド人数', value: '15-20人' },
          { label: 'スタメン', value: '11人' },
          { label: '同クラブ上限', value: '3人' },
        ]} />
        <Table
          headers={['ポジション', 'スカッド上限', 'スタメン最小', '選手の特徴']}
          colAlignments={['left', 'center', 'center', 'left']}
          rows={[
            ['GK ゴールキーパー', '1-2人', '1人', 'セーブ・クリーンシートで高得点'],
            ['DF ディフェンダー', '4-6人', '3人', 'クリーンシート・守備アクションが鍵'],
            ['MF ミッドフィールダー', '4-7人', '2人', 'キーパスやゴール関与で安定した得点'],
            ['FW フォワード', '1-5人', '1人', 'ゴールで一気に高得点。ハイリスク・ハイリターン'],
          ]}
        />
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
          colAlignments={['left', 'left']}
          rows={[
            ['選手の売却', '売却額 = 購入額の95%（移籍金変動後の現在額ではなく購入時の額が基準）'],
            ['選手の獲得', '現在の移籍金を全額支払い。予算に余裕がないと好選手を逃す'],
            ['同クラブの選手', '同じクラブから最大3人まで保有可能'],
          ]}
        />
      </Section>

      {/* キャプテン */}
      <Section label="Captain" title="キャプテン制度">
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, backgroundColor: '#161616', border: '1px solid var(--border-color)', borderRadius: 6, padding: 16 }}>
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
      </Section>

      {/* ポイント */}
      <Section label="Points System" title="ポイント計算">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.8 }}>
          選手ポイントはJスタッツをもとに自動計算されます。試合終了から最大2時間でポイントが反映されるはずです。
        </p>

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '0 0 8px', textTransform: 'uppercase' }}>出場時間</h3>
        <Table
          headers={['条件', 'pt']}
          colAlignments={['left', 'right']}
          rows={[
            ['90分出場（フル出場）', pt(3)],
            ['60-89分出場', pt(2)],
            ['1-59分出場', pt(1)],
            ['出場なし', pt(0)],
          ]}
        />

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '20px 0 8px', textTransform: 'uppercase' }}>チーム成績</h3>
        <Table
          headers={['条件', 'pt']}
          colAlignments={['left', 'right']}
          rows={[
            ['チーム勝利', pt(2)],
            ['引き分け・敗戦', pt(0)],
          ]}
        />

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '20px 0 8px', textTransform: 'uppercase' }}>攻撃スタッツ</h3>
        <Table
          headers={['条件', 'GK', 'DF', 'MF', 'FW']}
          rows={[
            ['ゴール / 1点', pt(6), pt(4), pt(4), pt(6)],
            ['アシスト / 1本', pt(5), pt(4), pt(4), pt(4)],
            ['キーパス / 2本以上', '—', '—', pt(1), pt(1)],
            ['キーパス / 4本以上', '—', '—', pt(2), pt(2)],
            ['キーパス / 6本以上', '—', '—', pt(3), pt(3)],
          ]}
        />

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '20px 0 8px', textTransform: 'uppercase' }}>守備スタッツ</h3>
        <Table
          headers={['条件', 'GK', 'DF', 'MF', 'FW']}
          rows={[
            ['クリーンシート（90分出場時）', pt(3), pt(3), pt(1), '—'],
            ['2失点', pt(-1), pt(-1), '—', '—'],
            ['3失点', pt(-2), pt(-2), '—', '—'],
            ['4失点以上', pt(-3), pt(-3), '—', '—'],
            ['セーブ 2本以上', pt(1), '—', '—', '—'],
            ['セーブ 4本以上', pt(2), '—', '—', '—'],
            ['セーブ 6本以上', pt(3), '—', '—', '—'],
            ['守備アクション合計 4以上 *', pt(3), pt(3), pt(3), pt(3)],
          ]}
        />
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 16px' }}>* タックル＋インターセプト＋ブロックの合計</p>

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '4px 0 8px', textTransform: 'uppercase' }}>個人スタッツ</h3>
        <Table
          headers={['条件', 'pt']}
          colAlignments={['left', 'right']}
          rows={[
            ['デュエル勝利 5回以上', pt(1)],
            ['デュエル勝利 8回以上', pt(2)],
            ['ファウルを受ける 4回以上', pt(1)],
            ['パス成功率 90%以上（30本以上）', pt(1)],
          ]}
        />

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '20px 0 8px', textTransform: 'uppercase' }}>レーティング（SofaScore）</h3>
        <Table
          headers={['レーティング', 'pt']}
          colAlignments={['left', 'right']}
          rows={[
            ['8.0以上', pt(3)],
            ['7.5以上', pt(2)],
            ['7.0以上', pt(1)],
            ['7.0未満', pt(0)],
          ]}
        />

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '20px 0 8px', textTransform: 'uppercase' }}>ペナルティ</h3>
        <Table
          headers={['条件', 'pt']}
          colAlignments={['left', 'right']}
          rows={[
            ['イエローカード', pt(-1)],
            ['レッドカード', pt(-4)],
            ['PKミス', pt(-3)],
          ]}
        />
      </Section>

      {/* 移籍金変動 */}
      <Section label="Transfer Value" title="移籍金変動システム">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.8 }}>
          GW終了後、すべての選手の移籍金がそのGWのポイントに応じて変動します。好パフォーマンスの選手は値上がり、不調・不出場の選手は値下がりします。低価格帯の選手ほど上昇幅が大きいため、安くて活躍する選手の発掘が攻略の鍵です。
        </p>

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '0 0 8px', textTransform: 'uppercase' }}>GWポイント → 基本変動額</h3>
        <Table
          headers={['GWポイント', '変動額', '目安']}
          colAlignments={['left', 'center', 'left']}
          rows={[
            ['12pt以上', yen(2000), '上位3%のハイパフォーマンス'],
            ['10-11pt', yen(1200), '上位8%'],
            ['8-9pt', yen(600), '上位15%'],
            ['6-7pt', yen(300), '上位30%'],
            ['4-5pt', yen(0), '平均帯（変動なし）'],
            ['2-3pt', yen(-300), '平均以下'],
            ['0-1pt', yen(-700), '低パフォーマンス'],
            ['-1pt以下', yen(-1200), 'カード・失点等でマイナス'],
            ['不出場（GW対象チーム）', yen(-800), 'ベンチ外・怪我など'],
          ]}
        />

        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: '24px 0 8px', textTransform: 'uppercase' }}>価格帯による上昇補正（下落には補正なし）</h3>
        <Table
          headers={['現在の移籍金', '上昇倍率', '特徴']}
          colAlignments={['left', 'center', 'left']}
          rows={[
            ['-2,000万', mul('1.8', '#4caf50'), '低価格帯は急上昇しやすい'],
            ['2,001-4,000万', mul('1.4', '#81c784'), ''],
            ['4,001-7,000万', mul('1.0', 'var(--text-primary)'), '基準'],
            ['7,001-10,000万', mul('0.7', '#ffb74d'), '高額になるほど上がりにくい'],
            ['10,001万-', mul('0.5', '#ef5350'), ''],
          ]}
        />

        <div style={{ backgroundColor: '#161616', border: '1px solid var(--border-color)', borderRadius: 6, padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>計算例</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { player: '1,000万円の選手が12pt以上獲得', calc: '2,000万 × 1.8 =', result: '+3,600万円' },
              { player: '5,000万円の選手が10pt獲得', calc: '1,200万 × 1.0 =', result: '+1,200万円' },
              { player: '8,000万円の選手が不出場', calc: '固定', result: '−800万円' },
            ].map(({ player, calc, result }) => (
              <div key={player} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{player}</span>
                <span style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{calc} </span>
                  <span style={{ fontWeight: 800, color: result.startsWith('+') ? '#4caf50' : '#ef5350' }}>{result}</span>
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '10px 0 0' }}>最低移籍金：1,000万円（どれだけ不振でもこれ以下にはならない）</p>
        </div>

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
            ['2-5位', yen(500)],
          ]}
        />
      </Section>

    </div>
  )
}
