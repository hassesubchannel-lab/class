// 入力ページと管理ページで共通の処理
(function () {
  const HR_BASE = "https://express.heartrails.com/api/json";
  let seq = 0;

  // JSONP 呼び出し（GitHub Pages のような静的サイトからでも外部 API を呼べる）
  function jsonp(url, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cb = "__cs_cb" + Date.now().toString(36) + (seq++);
      const q = new URLSearchParams(params);
      const script = document.createElement("script");
      let done = false;
      const cleanup = () => {
        done = true;
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        script.remove();
      };
      const timer = setTimeout(() => {
        if (done) return;
        cleanup();
        reject(new Error("通信がタイムアウトしました"));
      }, timeoutMs || 20000);
      window[cb] = (data) => {
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        clearTimeout(timer);
        if (done) return;
        cleanup();
        reject(new Error("通信に失敗しました"));
      };
      q.set(params.__cbName || "callback", cb);
      q.delete("__cbName");
      script.src = url + (url.includes("?") ? "&" : "?") + q.toString();
      document.head.appendChild(script);
    });
  }

  // HeartRails Express（駅・路線データの無料 API）
  function hr(params) {
    return jsonp(HR_BASE, Object.assign({ __cbName: "jsonp" }, params)).then((d) => {
      const r = (d && d.response) || {};
      if (r.error) {
        // 「見つからない」系は空結果として扱う
        return { station: [], line: [], error: r.error };
      }
      return r;
    });
  }

  function normalizeStationName(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/駅$/, "");
  }

  // 2点間の直線距離（km）
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR;
    const dLng = (lng2 - lng1) * toR;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // 同じ駅名・同じ場所の結果を1つにまとめる（新宿駅の JR/京王/小田急… → 1件）
  function groupStations(list) {
    const groups = [];
    for (const s of list) {
      const lat = Number(s.y), lng = Number(s.x);
      let g = groups.find(
        (g) => g.name === s.name && haversine(g.lat, g.lng, lat, lng) < 1.5
      );
      if (!g) {
        g = { name: s.name, prefecture: s.prefecture, lat, lng, lines: [] };
        groups.push(g);
      }
      if (!g.lines.includes(s.line)) g.lines.push(s.line);
    }
    return groups;
  }

  async function searchStations(name) {
    const n = normalizeStationName(name);
    if (!n) return [];
    const r = await hr({ method: "getStations", name: n });
    return groupStations(r.station || []);
  }

  async function nearestStations(lat, lng) {
    const r = await hr({ method: "getStations", x: lng, y: lat });
    return groupStations(r.station || []);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function storageGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function storageSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }

  window.CS = {
    jsonp, hr, haversine, groupStations, searchStations, nearestStations,
    normalizeStationName, escapeHtml, storageGet, storageSet
  };
})();
