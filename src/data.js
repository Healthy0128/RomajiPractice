/**
 * data.js - かな/ローマ字データ
 */

const KANA_DATA = [
  // 清音
  { kana: 'あ', romaji: 'a', category: 'basic' },
  { kana: 'い', romaji: 'i', category: 'basic' },
  { kana: 'う', romaji: 'u', category: 'basic' },
  { kana: 'え', romaji: 'e', category: 'basic' },
  { kana: 'お', romaji: 'o', category: 'basic' },
  { kana: 'か', romaji: 'ka', category: 'basic' },
  { kana: 'き', romaji: 'ki', category: 'basic' },
  { kana: 'く', romaji: 'ku', category: 'basic' },
  { kana: 'け', romaji: 'ke', category: 'basic' },
  { kana: 'こ', romaji: 'ko', category: 'basic' },
  { kana: 'さ', romaji: 'sa', category: 'basic' },
  { kana: 'し', romaji: 'shi', category: 'basic' },
  { kana: 'す', romaji: 'su', category: 'basic' },
  { kana: 'せ', romaji: 'se', category: 'basic' },
  { kana: 'そ', romaji: 'so', category: 'basic' },
  { kana: 'た', romaji: 'ta', category: 'basic' },
  { kana: 'ち', romaji: 'chi', category: 'basic' },
  { kana: 'つ', romaji: 'tsu', category: 'basic' },
  { kana: 'て', romaji: 'te', category: 'basic' },
  { kana: 'と', romaji: 'to', category: 'basic' },
  { kana: 'な', romaji: 'na', category: 'basic' },
  { kana: 'に', romaji: 'ni', category: 'basic' },
  { kana: 'ぬ', romaji: 'nu', category: 'basic' },
  { kana: 'ね', romaji: 'ne', category: 'basic' },
  { kana: 'の', romaji: 'no', category: 'basic' },
  { kana: 'は', romaji: 'ha', category: 'basic' },
  { kana: 'ひ', romaji: 'hi', category: 'basic' },
  { kana: 'ふ', romaji: 'fu', category: 'basic' },
  { kana: 'へ', romaji: 'he', category: 'basic' },
  { kana: 'ほ', romaji: 'ho', category: 'basic' },
  { kana: 'ま', romaji: 'ma', category: 'basic' },
  { kana: 'み', romaji: 'mi', category: 'basic' },
  { kana: 'む', romaji: 'mu', category: 'basic' },
  { kana: 'め', romaji: 'me', category: 'basic' },
  { kana: 'も', romaji: 'mo', category: 'basic' },
  { kana: 'や', romaji: 'ya', category: 'basic' },
  { kana: 'ゆ', romaji: 'yu', category: 'basic' },
  { kana: 'よ', romaji: 'yo', category: 'basic' },
  { kana: 'ら', romaji: 'ra', category: 'basic' },
  { kana: 'り', romaji: 'ri', category: 'basic' },
  { kana: 'る', romaji: 'ru', category: 'basic' },
  { kana: 'れ', romaji: 're', category: 'basic' },
  { kana: 'ろ', romaji: 'ro', category: 'basic' },
  { kana: 'わ', romaji: 'wa', category: 'basic' },
  { kana: 'を', romaji: 'wo', category: 'basic' },
  { kana: 'ん', romaji: 'n', category: 'basic' },

  // 濁音・半濁音
  { kana: 'が', romaji: 'ga', category: 'dakuten' },
  { kana: 'ぎ', romaji: 'gi', category: 'dakuten' },
  { kana: 'ぐ', romaji: 'gu', category: 'dakuten' },
  { kana: 'げ', romaji: 'ge', category: 'dakuten' },
  { kana: 'ご', romaji: 'go', category: 'dakuten' },
  { kana: 'ざ', romaji: 'za', category: 'dakuten' },
  { kana: 'じ', romaji: 'ji', category: 'dakuten' },
  { kana: 'ず', romaji: 'zu', category: 'dakuten' },
  { kana: 'ぜ', romaji: 'ze', category: 'dakuten' },
  { kana: 'ぞ', romaji: 'zo', category: 'dakuten' },
  { kana: 'だ', romaji: 'da', category: 'dakuten' },
  { kana: 'ぢ', romaji: 'ji', category: 'dakuten' },
  { kana: 'づ', romaji: 'zu', category: 'dakuten' },
  { kana: 'で', romaji: 'de', category: 'dakuten' },
  { kana: 'ど', romaji: 'do', category: 'dakuten' },
  { kana: 'ば', romaji: 'ba', category: 'dakuten' },
  { kana: 'び', romaji: 'bi', category: 'dakuten' },
  { kana: 'ぶ', romaji: 'bu', category: 'dakuten' },
  { kana: 'べ', romaji: 'be', category: 'dakuten' },
  { kana: 'ぼ', romaji: 'bo', category: 'dakuten' },
  { kana: 'ぱ', romaji: 'pa', category: 'dakuten' },
  { kana: 'ぴ', romaji: 'pi', category: 'dakuten' },
  { kana: 'ぷ', romaji: 'pu', category: 'dakuten' },
  { kana: 'ぺ', romaji: 'pe', category: 'dakuten' },
  { kana: 'ぽ', romaji: 'po', category: 'dakuten' },

  // 拗音
  { kana: 'きゃ', romaji: 'kya', category: 'yoon' },
  { kana: 'きゅ', romaji: 'kyu', category: 'yoon' },
  { kana: 'きょ', romaji: 'kyo', category: 'yoon' },
  { kana: 'しゃ', romaji: 'sha', category: 'yoon' },
  { kana: 'しゅ', romaji: 'shu', category: 'yoon' },
  { kana: 'しょ', romaji: 'sho', category: 'yoon' },
  { kana: 'ちゃ', romaji: 'cha', category: 'yoon' },
  { kana: 'ちゅ', romaji: 'chu', category: 'yoon' },
  { kana: 'ちょ', romaji: 'cho', category: 'yoon' },
  { kana: 'にゃ', romaji: 'nya', category: 'yoon' },
  { kana: 'にゅ', romaji: 'nyu', category: 'yoon' },
  { kana: 'にょ', romaji: 'nyo', category: 'yoon' },
  { kana: 'ひゃ', romaji: 'hya', category: 'yoon' },
  { kana: 'ひゅ', romaji: 'hyu', category: 'yoon' },
  { kana: 'ひょ', romaji: 'hyo', category: 'yoon' },
  { kana: 'みゃ', romaji: 'mya', category: 'yoon' },
  { kana: 'みゅ', romaji: 'myu', category: 'yoon' },
  { kana: 'みょ', romaji: 'myo', category: 'yoon' },
  { kana: 'りゃ', romaji: 'rya', category: 'yoon' },
  { kana: 'りゅ', romaji: 'ryu', category: 'yoon' },
  { kana: 'りょ', romaji: 'ryo', category: 'yoon' },
  { kana: 'ぎゃ', romaji: 'gya', category: 'yoon' },
  { kana: 'ぎゅ', romaji: 'gyu', category: 'yoon' },
  { kana: 'ぎょ', romaji: 'gyo', category: 'yoon' },
  { kana: 'じゃ', romaji: 'ja', category: 'yoon' },
  { kana: 'じゅ', romaji: 'ju', category: 'yoon' },
  { kana: 'じょ', romaji: 'jo', category: 'yoon' },
  { kana: 'びゃ', romaji: 'bya', category: 'yoon' },
  { kana: 'びゅ', romaji: 'byu', category: 'yoon' },
  { kana: 'びょ', romaji: 'byo', category: 'yoon' },
  { kana: 'ぴゃ', romaji: 'pya', category: 'yoon' },
  { kana: 'ぴゅ', romaji: 'pyu', category: 'yoon' },
  { kana: 'ぴょ', romaji: 'pyo', category: 'yoon' },

  // その他（採点対象外記号）
  { kana: 'っ', romaji: '(pause)', category: 'other' },
  { kana: 'ー', romaji: '(long)', category: 'other' }
];

function getKanaData(kana) {
  return KANA_DATA.find(d => d.kana === kana);
}

function getKanaByCategory(category) {
  if (!category) return KANA_DATA;
  return KANA_DATA.filter(d => d.category === category);
}

function getCategoryForKana(kana) {
  const d = KANA_DATA.find(x => x.kana === kana);
  return d ? d.category : 'basic';
}
