import { Hud, ICONS, josa } from '../ui/hud';
import { missionsHtml, shopHtml } from '../ui/panels';
import { addLove, buy, claim, did, levelOf, loadGame, saveGame, unclaimed, visit, wear, MISSIONS, type Kind } from './progress';
import { CATALOG, item, themeRamps, type Slot } from './shop';
import type { Material } from '../cat3d/pixclass';

/** what the game needs of the app round it */
export interface Stagehands {
  sound(name: string, o?: { gain?: number; rate?: number; delay?: number }): void;
  tap(): void;
  /** the cat's head on the screen (css px), if it is to be seen */
  head(): { x: number; y: number } | null;
  /** the room's colours, as chosen */
  theme(ramps: Partial<Record<Material, string[]>>): void;
  /** what the cat wears (item ids, null: nothing) */
  dress(neck: string | null, head: string | null): void;
  album(): void;
  /** the hunt begun (false: the cat cannot play now) */
  hunt(): boolean;
  hasPhotos(): boolean;
  now(): number;
}

/**
 * The game, run: affection won pops up as hearts over the cat (each with a coin), the levels it
 * brings come with a card and coins and new things in the shop; the day's first visit brings the
 * coins for coming; the missions fill as things are done with the cat, and are claimed from their
 * sheet; the shop sells the room's colours and things for the cat to wear.
 */
export class Director {
  readonly game = loadGame();
  readonly hud: Hud;
  private slot: Slot = 'wall';
  private sheetIs: 'missions' | 'shop' | null = null;
  /** affection won in fractions (stroking: a heart every second or two), by what */
  private part: Partial<Record<string, number>> = {};
  private dirty = false;
  private saveIn = 0;
  private lastHeartSound = 0;

  constructor(private readonly io: Stagehands) {
    this.hud = new Hud();
    this.hud.onPress = (k) => this.press(k);
    this.hud.onCard = () => this.openShop();
    this.hud.sheet.onClose = () => { this.sheetIs = null; };
    this.hud.sheet.body.addEventListener('click', (e) => this.sheetClick(e));
    this.refresh(false);
    this.dressUp();
  }

  /** the app open, or come back to: the day's first visit, its coins and its missions */
  arrive() {
    const v = visit(this.game, this.io.now());
    this.refresh(false);
    this.changed();
    if (!v) return;
    setTimeout(() => {
      this.io.sound('fanfare', { gain: 0.35 });
      this.hud.card(`<div class="beat">${ICONS.coin(44)}</div><h3>출석 ${v.streak}일째!</h3><p class="gold">+${v.coins}냥</p>
        <p>오늘의 할 일 3개가 왔어요</p>`, '할 일 보기');
      this.hud.onCard = () => this.openMissions();
      this.hud.setCoins(this.game.coins);
    }, 1800);
  }

  /** affection won (n hearts): hearts over the cat, a coin each, and any levels it brings */
  love(n: number, why?: string) {
    if (n <= 0) return;
    const h = this.io.head();
    if (h) {
      for (let i = 0; i < Math.min(n, 4); i++) {
        setTimeout(() => this.hud.pop({ x: h.x + (Math.random() - 0.5) * 30, y: h.y - 20 - Math.random() * 10, text: i === 0 ? `+${n}` : '', icon: 'heart' }), i * 110);
      }
    }
    const t = performance.now();
    if (t - this.lastHeartSound > 350) {
      this.lastHeartSound = t;
      this.io.sound('heart', { gain: 0.12, rate: 0.95 + Math.random() * 0.15 });
    }
    this.game.coins += n;
    const ups = addLove(this.game, n);
    if (why) this.hud.toast(why, 2200);
    this.refresh(true);
    this.changed();
    for (const u of ups) this.levelUp(u.level, u.coins);
  }

  /** affection won by the second (stroking, a game): a heart for every so many seconds of it */
  trickle(key: string, dt: number, perHeart: number) {
    const v = (this.part[key] ?? 0) + dt / perHeart;
    if (v >= 1) {
      this.part[key] = v - 1;
      this.love(1);
    } else this.part[key] = v;
  }

  /** something done with the cat (how much): the missions it moves on, and a word when one is done */
  did(kind: Kind, n = 1) {
    const done = did(this.game, kind, n);
    this.changed();
    if (this.sheetIs === 'missions' && n >= 1) this.render();
    for (const m of done) {
      this.io.sound('coin', { gain: 0.25, rate: 1.2 });
      this.hud.toast(`<span>할 일 완료!</span><span style="color:#ffe08a">${MISSIONS[m.kind].say(m.need)}</span>`, 2800);
    }
    if (done.length) this.refresh(false);
  }

  private levelUp(level: number, coins: number) {
    const opened = CATALOG.filter((i) => i.lv === level).length;
    this.io.sound('fanfare', { gain: 0.45 });
    this.io.tap();
    this.hud.card(`<div class="beat">${ICONS.heart(44)}</div><h3>애정 레벨 업!</h3><p style="font-size:calc(20 * var(--fpx));color:#ffd6dc">Lv ${level}</p><p class="gold">+${coins}냥</p>${opened ? `<p>상점에 새 물건 ${opened}개가 들어왔어요</p>` : '<p>고양이가 당신을 더 좋아하게 됐어요</p>'}`, opened ? '상점 보기' : undefined);
    this.hud.onCard = () => this.openShop();
  }

  private press(k: string) {
    this.io.tap();
    if (k === 'missions') this.openMissions();
    else if (k === 'shop') this.openShop();
    else if (k === 'album') this.io.album();
    else if (k === 'hunt') {
      if (!this.io.hunt()) this.hud.toast('고양이가 지금은 놀 수 없대요. 조금 있다가 다시 해 봐요', 2600);
      else this.hud.toast('화면을 누른 채 빨간 점으로 고양이를 나비에게 데려가세요!', 3600);
    }
    else if (k === 'love') {
      const L = levelOf(this.game.love);
      this.hud.toast(`애정 Lv ${L.level} · 다음 레벨까지 ♥${L.need - Math.floor(L.into)}`, 2600);
    } else if (k === 'coins') this.hud.toast('냥은 고양이와 놀고 돌보면 모여요. 상점에서 써 보세요', 2600);
  }

  openMissions() {
    this.hud.closeCard();
    this.sheetIs = 'missions';
    this.render();
    this.hud.sheet.show('오늘의 할 일');
  }

  openShop(slot?: Slot) {
    this.hud.closeCard();
    if (slot) this.slot = slot;
    this.sheetIs = 'shop';
    this.render();
    this.hud.sheet.show('상점');
  }

  /** a hunt over: what was caught, its coins and affection, and the best so far */
  hunted(score: number, combo: number) {
    const g = this.game, record = score > g.best;
    if (record) g.best = score;
    const coins = score * 6 + Math.max(0, combo - 1) * 4;
    g.coins += coins;
    this.did('hunt', score);
    this.did('play', 30);
    this.io.sound('fanfare', { gain: 0.4 });
    this.hud.card(`<div class="beat">${ICONS.fly(44)}</div><h3>사냥 끝!</h3><p style="font-size:calc(18 * var(--fpx))">나비 ${score}마리</p>
      ${combo > 1 ? `<p>최고 콤보 x${combo}</p>` : ''}<p class="gold">+${coins}냥</p><p>${record && score > 0 ? '새 최고 기록!' : `최고 기록 ${g.best}마리`}</p>`, '한 번 더');
    this.hud.onCard = () => { this.press('hunt'); };
    this.changed();
    this.refresh(true);
    if (score > 0) this.love(Math.min(10, score));
  }

  get busy() {
    return this.hud.sheet.open || this.hud.carding;
  }

  private render() {
    const S = this.hud.sheet;
    S.setCoins(this.game.coins);
    if (this.sheetIs === 'missions') S.body.innerHTML = missionsHtml(this.game);
    else if (this.sheetIs === 'shop') S.body.innerHTML = shopHtml(this.game, this.slot);
  }

  private sheetClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-claim],[data-buy],[data-wear],[data-tab]');
    if (!t) return;
    const r = t.getBoundingClientRect(), at = { x: r.left + r.width / 2, y: r.top };
    if (t.dataset.claim) {
      const m = this.game.missions[+t.dataset.claim];
      const coins = m ? claim(this.game, m) : 0;
      if (coins) {
        this.coinBurst(at, coins);
        this.io.sound('coin', { gain: 0.3 });
        this.io.tap();
      }
    } else if (t.dataset.buy) {
      const it = item(t.dataset.buy);
      if (it && buy(this.game, it.id)) {
        wear(this.game, it.id);
        this.io.sound('coin', { gain: 0.3, rate: 0.8 });
        this.io.sound('fanfare', { gain: 0.25, delay: 0.1 });
        this.io.tap();
        this.dressUp();
        this.hud.toast(it.look ? `<span style="color:#ffe08a">${it.name}</span>${josa(it.name, '을')} 고양이에게 해 줬어요!` : `<span style="color:#ffe08a">${it.name}</span>${josa(it.name, '으로')} 방을 꾸몄어요!`, 2600);
      }
    } else if (t.dataset.wear) {
      wear(this.game, t.dataset.wear);
      this.io.sound('pencil', { gain: 0.05, rate: 2.2 });
      this.dressUp();
    } else if (t.dataset.tab) {
      this.slot = t.dataset.tab as Slot;
    }
    this.changed();
    this.refresh(true);
    this.render();
  }

  /** coins flying up from a point (a claimed mission) */
  private coinBurst(at: { x: number; y: number }, n: number) {
    for (let i = 0; i < Math.min(8, 2 + n / 10); i++) {
      setTimeout(() => this.hud.pop({ x: at.x + (Math.random() - 0.5) * 50, y: at.y, text: i === 0 ? `+${n}` : '', icon: 'coin' }), i * 70);
    }
  }

  /** the room's colours and the cat's things, as chosen */
  private dressUp() {
    const w = this.game.worn;
    this.io.theme(themeRamps(w));
    this.io.dress(w.neck, w.head);
  }

  /** what the hud shows: the level, the coins, the badges */
  private refresh(bump: boolean) {
    const L = levelOf(this.game.love);
    this.hud.setLove(L.level, L.into / L.need);
    this.hud.setCoins(this.game.coins, bump);
    this.hud.badge('missions', unclaimed(this.game));
    const level = L.level;
    // (something in the shop to be had: open at this level, not had, and coins enough)
    const can = CATALOG.some((i) => !this.game.owned.includes(i.id) && i.lv <= level && i.price <= this.game.coins);
    this.hud.badge('shop', can ? -1 : 0);
    this.hud.show('album', this.io.hasPhotos());
  }

  private changed() {
    this.dirty = true;
  }

  /** a frame: kept now and then */
  step(dt: number) {
    if (this.dirty && (this.saveIn -= dt) <= 0) {
      saveGame(this.game);
      this.dirty = false;
      this.saveIn = 2;
    }
  }

  save() {
    saveGame(this.game);
    this.dirty = false;
  }
}
