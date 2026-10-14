/**
 * Rig jalan (DOM tipis): tiga lapis <img> dari sprite dasar yang sama
 * (badan + kaki kiri + kaki kanan) di dalam .char.
 *
 * Struktur: .walkrig (kotak = sprite dasar, flip persis img dasar)
 *   > .walkrig-tilt (putar condong di titik kaki)
 *     > img badan (clip = polygon tanpa kaki) + 2 img kaki (clip = inset).
 * Matematika pose/clip ada di walk-logic.js (murni, teruji).
 */
import { bodyClipPolygon, footInset } from './walk-logic.js';

/**
 * @param {{ charEl: HTMLElement, beforeEl: HTMLElement|null, src: string, w: number, h: number, rig: { bandTop: number, feet: [[number, number]] }, feet: [number, number] }} opts
 * @returns {{ apply: (dir: number, pose: {leftLift:number,rightLift:number,leftShift:number,rightShift:number,bodyBob:number,lean:number}) => void, show: () => void, hide: () => void, visible: () => boolean } | null}
 */
export function createWalkRig(opts) {
  const { charEl, beforeEl, src, w, h, rig, feet } = opts;
  if (!rig || !Array.isArray(rig.feet) || rig.feet.length < 2) return null;
  const doc = charEl.ownerDocument;

  const outer = doc.createElement('div');
  outer.className = 'walkrig';
  outer.setAttribute('aria-hidden', 'true');
  outer.style.position = 'absolute';
  outer.style.bottom = '0px';
  outer.style.left = Math.round(-w / 2) + 'px';
  outer.style.width = w + 'px';
  outer.style.height = h + 'px';
  outer.style.display = 'none';

  // Lapis condong: origin di titik kaki (px dari pojok kiri-atas gambar).
  const tilt = doc.createElement('div');
  tilt.className = 'walkrig-tilt';
  tilt.style.position = 'absolute';
  tilt.style.inset = '0';
  tilt.style.transformOrigin = `${feet[0]}px ${feet[1]}px`;

  const mk = (clip) => {
    const im = doc.createElement('img');
    im.setAttribute('src', src);
    im.setAttribute('alt', '');
    im.setAttribute('draggable', 'false');
    im.style.position = 'absolute';
    im.style.left = '0px';
    im.style.top = '0px';
    im.style.width = w + 'px';
    im.style.height = h + 'px';
    im.style.pointerEvents = 'none';
    im.style.userSelect = 'none';
    im.style.clipPath = clip;
    tilt.appendChild(im);
    return im;
  };

  const body = mk(bodyClipPolygon(rig, w, h));
  const footL = mk(footInset(rig.feet[0], rig, w, h));
  const footR = mk(footInset(rig.feet[1], rig, w, h));

  outer.appendChild(tilt);
  if (beforeEl && beforeEl.parentNode === charEl) charEl.insertBefore(outer, beforeEl);
  else charEl.appendChild(outer);

  function apply(dir, pose) {
    // Flip persis img dasar (kotak sama, origin bawaan = tengah).
    outer.style.transform = dir < 0 ? 'scaleX(-1)' : 'none';
    tilt.style.transform = pose.lean ? `rotate(${pose.lean}deg)` : 'none';
    body.style.transform = pose.bodyBob ? `translateY(${-pose.bodyBob}px)` : 'none';
    footL.style.transform =
      pose.leftShift || pose.leftLift ? `translate(${pose.leftShift}px, ${-pose.leftLift}px)` : 'none';
    footR.style.transform =
      pose.rightShift || pose.rightLift ? `translate(${pose.rightShift}px, ${-pose.rightLift}px)` : 'none';
  }

  function show() {
    outer.style.display = 'block';
  }
  function hide() {
    outer.style.display = 'none';
    outer.style.transform = 'none';
    tilt.style.transform = 'none';
    body.style.transform = 'none';
    footL.style.transform = 'none';
    footR.style.transform = 'none';
  }
  function visible() {
    return outer.style.display !== 'none';
  }

  return { apply, show, hide, visible };
}
