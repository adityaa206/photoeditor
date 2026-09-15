/* PhotoEditor - history.js : undo / redo stack */
(function () {
  'use strict';
  const PE = window.PE;

  const MAX_ENTRIES = 60;
  const MAX_BYTES = 700 * 1024 * 1024; // approximate memory budget for pixel snapshots

  PE.history = {
    entries: [],
    index: 0,          // number of entries currently applied
    _bytes: 0,
    _batch: null,

    /** Record an already-applied change. undo() reverts it, redo() re-applies it. */
    push(entry) {
      if (this._batch) { this._batch.items.push(entry); return; }
      // drop redo branch
      while (this.entries.length > this.index) { const e = this.entries.pop(); this._bytes -= e.bytes || 0; }
      entry.bytes = entry.bytes || 0;
      this.entries.push(entry);
      this.index = this.entries.length;
      this._bytes += entry.bytes;
      // trim oldest while over budget (always keep at least a few)
      while ((this.entries.length > MAX_ENTRIES || this._bytes > MAX_BYTES) && this.entries.length > 3) {
        const e = this.entries.shift(); this._bytes -= e.bytes || 0; this.index--;
      }
      PE.events.emit('historychange');
    },
    /** Group several pushes into one entry. */
    begin(label) { if (this._batch) return; this._batch = { label, items: [] }; },
    end() {
      const b = this._batch; this._batch = null;
      if (!b || !b.items.length) { return; }
      if (b.items.length === 1) { const only = b.items[0]; only.label = b.label || only.label; this.push(only); return; }
      const items = b.items;
      this.push({
        label: b.label,
        bytes: items.reduce((s, e) => s + (e.bytes || 0), 0),
        undo() { for (let i = items.length - 1; i >= 0; i--) items[i].undo(); },
        redo() { for (const e of items) e.redo(); },
      });
    },
    canUndo() { return this.index > 0; },
    canRedo() { return this.index < this.entries.length; },
    undo() {
      if (!this.canUndo()) return false;
      this.index--;
      const e = this.entries[this.index];
      try { e.undo(); } catch (err) { console.error('undo failed', err); }
      PE.events.emit('historychange');
      PE.events.emit('docchange');
      return true;
    },
    redo() {
      if (!this.canRedo()) return false;
      const e = this.entries[this.index];
      this.index++;
      try { e.redo(); } catch (err) { console.error('redo failed', err); }
      PE.events.emit('historychange');
      PE.events.emit('docchange');
      return true;
    },
    jumpTo(n) {
      n = PE.clamp(n, 0, this.entries.length);
      while (this.index > n) this.undo();
      while (this.index < n) this.redo();
    },
    clear() { this.entries = []; this.index = 0; this._bytes = 0; this._batch = null; PE.events.emit('historychange'); },
  };

  /* ---------- helpers to build entries ---------- */

  /** Pixel change on a canvas inside `rect`; `before` must be captured BEFORE the change and `after` after it. */
  PE.history.pixelEntry = function (label, canvas, rect, before, after, onApply) {
    return {
      label,
      bytes: before.data.length * 2,
      undo() { canvas.getContext('2d').putImageData(before, rect.x, rect.y); onApply && onApply(); },
      redo() { canvas.getContext('2d').putImageData(after, rect.x, rect.y); onApply && onApply(); },
    };
  };
  /** Snapshot properties of an object before a change; call returned fn after to push the entry. */
  PE.history.propChange = function (label, obj, keys, onApply) {
    const before = {}; for (const k of keys) before[k] = obj[k];
    return function commit() {
      const after = {}; let changed = false;
      for (const k of keys) { after[k] = obj[k]; if (after[k] !== before[k]) changed = true; }
      if (!changed) return false;
      PE.history.push({
        label,
        undo() { Object.assign(obj, before); onApply && onApply(); },
        redo() { Object.assign(obj, after); onApply && onApply(); },
      });
      return true;
    };
  };
})();
