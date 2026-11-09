// ── 开场白 ──────────────────────────────────────────────
// app 显示这些开场白；服务器收到点喜欢时发的开场白，按这里的分类给发送的人加减分（同一份，两边不会对不上）
// 浏览器里是普通 <script>（定义全局变量），服务器里用 require 读

// 每一类开场白发出去一次给发送的人加减几分。加分对同一个人只算一次（防刷分），扣分每次都算
const OPENER_SCORES = { profile: +2, normal: +1, boring: -1, weird: -2, flagged: -3 };

const OPENER_FIXED = [
  // normal：普通的问题（+1）
  { zh: "你多高呀", en: "How tall are you?", type: "normal" },
  { zh: "你是哪里人呀", en: "Where are you from?", type: "normal" },
  { zh: "在哪里工作呀", en: "Where do you work?", type: "normal" },
  { zh: "平时几点睡呀", en: "What time do you sleep?", type: "normal" },
  { zh: "平时喜欢宅在家吗", en: "Homebody or go-out type?", type: "normal" },
  { zh: "你平时去哪里溜达", en: "Where do you hang out?", type: "normal" },
  { zh: "你最近在忙什么", en: "What keeps you busy?", type: "normal" },
  // weird：奇怪的兽人问题（-2）
  { zh: "你会咬人吗", en: "Do you bite?", type: "weird" },
  { zh: "你的尾巴多长", en: "How long is your tail?", type: "weird" },
  { zh: "你冬天会冬眠吗", en: "Do you hibernate?", type: "weird" },
  { zh: "你的毛是天然色吗", en: "Is your fur natural?", type: "weird" },
  { zh: "我梦见你了", en: "I dreamed of you", type: "weird" },
  { zh: "你身上香吗", en: "Do you smell nice?", type: "weird" },
  { zh: "你咬人疼吗", en: "Does your bite hurt?", type: "weird" },
  { zh: "看起来好好抱", en: "You look so huggable", type: "weird" },
  { zh: "宝宝你好美", en: "Babe, you're gorgeous", type: "weird" },
  { zh: "你是食草还是食肉的", en: "Herbivore or carnivore?", type: "weird" },
  { zh: "你有没有换过毛色", en: "Ever dyed your fur?", type: "weird" },
  { zh: "你毛多还是毛少", en: "Fluffy or sleek?", type: "weird" },
  { zh: "你的爪子锋利吗", en: "Are your claws sharp?", type: "weird" },
  { zh: "你平时用四肢走路吗", en: "Do you walk on all fours?", type: "weird" },
  // boring：无聊的打招呼、只夸外表（-1）
  { zh: "你好呀", en: "Hello~", type: "boring" },
  { zh: "你好", en: "Hi", type: "boring" },
  { zh: "hihi", en: "", type: "boring" }, // 中英文一样，只显示一次
  { zh: "哈喽", en: "Hey there", type: "boring" },
  { zh: "在吗", en: "You there?", type: "boring" },
  { zh: "嗨", en: "Hey", type: "boring" },
  { zh: "哈喽哈喽", en: "Hellooo", type: "boring" },
  { zh: "在忙吗", en: "Busy?", type: "boring" },
  { zh: "好可爱", en: "So cute", type: "boring" },
  { zh: "好帅", en: "So handsome", type: "boring" },
  { zh: "好酷", en: "So cool", type: "boring" },
  { zh: "好萌", en: "Adorable", type: "boring" },
  { zh: "好喜欢", en: "Really into you", type: "boring" },
  // flagged：危险发言（-3）
  { zh: "睡了吗", en: "You awake?", type: "flagged" },
  { zh: "你一个人住吗", en: "Do you live alone?", type: "flagged" },
  { zh: "发我你的照片", en: "Send me your photos", type: "flagged" },
  { zh: "好近呀", en: "You're so close by", type: "flagged" },
  { zh: "约吗", en: "Wanna hook up?", type: "flagged" },
  { zh: "看起来好好吃", en: "You look delicious", type: "flagged" },
  { zh: "你会有反差吗", en: "Got a hidden wild side?", type: "flagged" },
  { zh: "你看起来很反差", en: "Bet you're wild behind that face", type: "flagged" },
  { zh: "wechat plz", en: "", type: "flagged" }, // 中英文一样，只显示一次
  { zh: "你的v呢", en: "What's your WeChat?", type: "flagged" },
  { zh: "可以要你的v吗", en: "Can I get your WeChat?", type: "flagged" },
];

// 按对方档案生成的开场白（app 里的 _genProfileOpeners）的句式：说明认真看了 ta 的档案
const OPENER_PROFILE_RE =
  /^(我也喜欢.+！ \/ I like .+ too!|原来你是 .+！ \/ Oh, you're an? .+!|.+的工作累不累？ \/ .+, huh\? Is the job tiring\?|不用上班是什么感觉？ \/ What's it like not having to work\?)$/;

// 开场白显示 / 发出去的样子：「中文 / English」，中英文一样的只写一次
const openerText = (o) => (o.en ? `${o.zh} / ${o.en}` : o.zh);

// 一句话是哪一类开场白；不是开场白返回 null
function openerType(text) {
  const fixed = OPENER_FIXED.find((o) => openerText(o) === text);
  if (fixed) return fixed.type;
  return OPENER_PROFILE_RE.test(text) ? "profile" : null;
}

if (typeof module !== "undefined") module.exports = { OPENER_SCORES, OPENER_FIXED, openerType };
