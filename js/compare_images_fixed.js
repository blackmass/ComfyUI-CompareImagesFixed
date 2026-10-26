import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "CompareImagesFixed";

function loadImage(info) {
  return new Promise((resolve) => {
    if (!info) return resolve(null);
    const params = new URLSearchParams({
      filename: info.filename,
      type: info.type,
      subfolder: info.subfolder || "",
      rand: Math.random().toString(),
    });
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = api.apiURL("/view?" + params.toString());
  });
}

// 영역 안에 비율 유지(contain)로 이미지를 맞춘 사각형
function fitRect(img, x, y, w, h) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}

app.registerExtension({
  name: "Custom.CompareImagesFixed",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      this._cmp = {
        a: null,
        b: null,
        active: false,
        flip: false,
        mode: "h", // "h": 좌우 슬라이드, "v": 위아래 슬라이드
        ratio: 0.5,
      };
      this.size = [360, 380];
    };

    const computeSize = nodeType.prototype.computeSize;
    nodeType.prototype.computeSize = function (out) {
      const s = computeSize ? computeSize.apply(this, arguments) : [200, 100];
      s[0] = Math.max(s[0], 240);
      s[1] = Math.max(s[1], 240);
      return s;
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = async function (message) {
      onExecuted?.apply(this, arguments);
      const [a, b] = await Promise.all([
        loadImage(message?.a_images?.[0]),
        loadImage(message?.b_images?.[0]),
      ]);
      this._cmp.a = a;
      this._cmp.b = b;
      this.setDirtyCanvas(true, true);
    };

    // 이미지가 그려지는 영역 (노드 로컬 좌표)
    nodeType.prototype._cmpArea = function () {
      const slots = Math.max(this.inputs?.length || 0, this.outputs?.length || 0);
      const top = slots * (LiteGraph.NODE_SLOT_HEIGHT || 20) + 8;
      const pad = 6;
      return {
        x: pad,
        y: top,
        w: this.size[0] - pad * 2,
        h: this.size[1] - top - pad,
      };
    };

    // 실제 그림이 그려지는 사각형 (노드 로컬 좌표)
    nodeType.prototype._cmpImageRect = function () {
      const area = this._cmpArea();
      const ref = this._cmp.a || this._cmp.b;
      return ref ? fitRect(ref, area.x, area.y, area.w, area.h) : null;
    };

    // 마우스 이동 처리: 그림 영역 안/밖 판정 + 진입 방향 결정 + 슬라이더 갱신
    nodeType.prototype._cmpHandle = function (pos) {
      const c = this._cmp;
      const r = this._cmpImageRect();
      if (!r) return;

      const inside =
        pos[0] >= r.x && pos[0] <= r.x + r.w &&
        pos[1] >= r.y && pos[1] <= r.y + r.h;

      if (!inside) {
        if (c.active) {
          c.active = false;
          this.setDirtyCanvas(true, false);
        }
        return;
      }

      // 그림 영역에 막 들어온 순간: 가장 가까운 그림 가장자리로 방향 결정
      if (!c.active) {
        const dL = pos[0] - r.x;
        const dR = r.x + r.w - pos[0];
        const dT = pos[1] - r.y;
        const dB = r.y + r.h - pos[1];
        const dx = Math.min(dL, dR);
        const dy = Math.min(dT, dB);
        c.mode = dx <= dy ? "h" : "v";
        // 왼쪽/위에서 들어오면 B를 그쪽에서부터 펼치도록 뒤집음
        c.flip = c.mode === "h" ? dL < dR : dT < dB;
        c.active = true;
      }

      const t = c.mode === "h" ? (pos[0] - r.x) / r.w : (pos[1] - r.y) / r.h;
      c.ratio = Math.min(1, Math.max(0, t));
      this.setDirtyCanvas(true, false);
    };

    nodeType.prototype.onMouseEnter = function () {
      const gm = app.canvas?.graph_mouse;
      if (gm) this._cmpHandle([gm[0] - this.pos[0], gm[1] - this.pos[1]]);
    };

    nodeType.prototype.onMouseMove = function (e, pos) {
      this._cmpHandle(pos);
    };

    nodeType.prototype.onMouseLeave = function () {
      this._cmp.active = false;
      this.setDirtyCanvas(true, false);
    };

    nodeType.prototype.onDrawForeground = function (ctx) {
      if (this.flags?.collapsed) return;
      const c = this._cmp;
      if (!c) return;
      const area = this._cmpArea();
      if (area.w <= 0 || area.h <= 0) return;

      const { a, b } = c;
      const first = a || b;
      if (!first) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.w, area.h);
      ctx.clip();

      // 기본: image_a 만 표시
      const base = a || b;
      const rb = fitRect(base, area.x, area.y, area.w, area.h);
      ctx.drawImage(base, rb.x, rb.y, rb.w, rb.h);

      // 호버 중에만 image_b 를 슬라이더 기준으로 덮어 그림
      if (c.active && a && b) {
        const ra = fitRect(a, area.x, area.y, area.w, area.h);
        const rB = fitRect(b, area.x, area.y, area.w, area.h);
        ctx.save();
        ctx.beginPath();
        if (c.mode === "h") {
          const x = ra.x + ra.w * c.ratio;
          if (c.flip) ctx.rect(area.x, area.y, x - area.x, area.h);
          else ctx.rect(x, area.y, area.x + area.w - x, area.h);
        } else {
          const y = ra.y + ra.h * c.ratio;
          if (c.flip) ctx.rect(area.x, area.y, area.w, y - area.y);
          else ctx.rect(area.x, y, area.w, area.y + area.h - y);
        }
        ctx.clip();
        ctx.drawImage(b, rB.x, rB.y, rB.w, rB.h);
        ctx.restore();

        // 슬라이더 선 (원형 핸들 없음)
        // 캔버스 줌(ds.scale)만큼 나눠서 항상 화면상 1px 유지 (값 하나 읽는 비용뿐)
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1 / (app.canvas?.ds?.scale || 1);
        ctx.beginPath();
        if (c.mode === "h") {
          const x = ra.x + ra.w * c.ratio;
          ctx.moveTo(x, ra.y);
          ctx.lineTo(x, ra.y + ra.h);
        } else {
          const y = ra.y + ra.h * c.ratio;
          ctx.moveTo(ra.x, y);
          ctx.lineTo(ra.x + ra.w, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };
  },
});
