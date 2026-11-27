/* 三消对战的敌人（独立设计，与玩家卡池无关） */

export const ENEMIES = [
  { key: "vine", name: "腐化藤妖", art: "../img/enemy/e_vine.webp", hp: 150, atk: 12, element: "风", desc: "枯藤缠身，靠腐蚀之力缓慢侵蚀。" },
  { key: "hound", name: "灰烬狼犬", art: "../img/enemy/e_hound.webp", hp: 120, atk: 16, element: "火", desc: "双头俱焚，余烬未熄。" },
  { key: "spider", name: "深渊晶蛛", art: "../img/enemy/e_spider.webp", hp: 180, atk: 13, element: "暗", desc: "八棱水晶为足，腹中藏着星海。" },
  { key: "raven", name: "雷暴鸦灵", art: "../img/enemy/e_raven.webp", hp: 140, atk: 18, element: "雷", desc: "由雷云凝聚，翅尖带电弧。" },
  { key: "golem", name: "熔岩巨像", art: "../img/enemy/e_golem.webp", hp: 240, atk: 15, element: "火", desc: "黑曜石之躯，胸口火光跳动。" },
  { key: "wraith", name: "虚空蚀影", art: "../img/enemy/e_wraith.webp", hp: 160, atk: 20, element: "暗", desc: "斗篷之下只有两点幽光。" },
];

/** 按挑战次数成长 */
export function pickEnemy(wins = 0) {
  const base = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
  const k = 1 + Math.min(1.8, wins * 0.12);
  return {
    ...base,
    hp: Math.round(base.hp * k),
    atk: Math.round(base.atk * (1 + Math.min(1.2, wins * 0.07))),
  };
}
