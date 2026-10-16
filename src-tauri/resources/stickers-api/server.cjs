"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron-shim.ts
function clipboardy() {
  return require("clipboardy");
}
function getIpcHandlers() {
  return handlers;
}
function emitToRenderer(channel, payload) {
  bus.emit("push", channel, payload);
}
function onRendererPush(cb) {
  bus.on("push", cb);
}
var import_node_events, import_node_os, import_node_path, import_node_fs, handlers, bus, MockWebContents, mockWindow, app, ipcMain, clipboard, nativeImage, BrowserWindow, shell, Menu, electronApp, optimizer;
var init_electron_shim = __esm({
  "electron-shim.ts"() {
    "use strict";
    import_node_events = require("node:events");
    import_node_os = require("node:os");
    import_node_path = require("node:path");
    import_node_fs = __toESM(require("node:fs"), 1);
    handlers = /* @__PURE__ */ new Map();
    bus = new import_node_events.EventEmitter();
    MockWebContents = class {
      send(channel, payload) {
        emitToRenderer(channel, payload);
      }
      isDestroyed() {
        return false;
      }
      setWindowOpenHandler() {
        return { action: "deny" };
      }
      on() {
        return void 0;
      }
    };
    mockWindow = null;
    app = {
      getPath(name) {
        if (name === "userData") {
          return (0, import_node_path.join)((0, import_node_os.homedir)(), "AppData", "Roaming", "stickers");
        }
        return (0, import_node_path.join)((0, import_node_os.homedir)(), "AppData", "Roaming", "stickers");
      },
      whenReady() {
        return Promise.resolve({
          then(fn) {
            fn();
            return Promise.resolve();
          }
        });
      },
      on() {
      },
      quit() {
      }
    };
    ipcMain = {
      handle(channel, fn) {
        handlers.set(channel, fn);
      }
    };
    clipboard = {
      readText() {
        try {
          return clipboardy().readSync();
        } catch {
          return "";
        }
      },
      writeText(text) {
        clipboardy().writeSync(text);
      },
      readImage() {
        return nativeImage.createFromBuffer(Buffer.alloc(0));
      },
      writeImage(img) {
        const png = img.toPNG();
        if (png.length) {
          clipboardy().writeSync(png);
        }
      }
    };
    nativeImage = {
      createFromPath(filePath) {
        let buf = Buffer.alloc(0);
        try {
          buf = import_node_fs.default.readFileSync(filePath);
        } catch {
          buf = Buffer.alloc(0);
        }
        return {
          isEmpty() {
            return !buf.length;
          },
          toPNG() {
            return buf;
          }
        };
      },
      createFromBuffer(buf) {
        return {
          isEmpty() {
            return !buf?.length;
          },
          toPNG() {
            return buf;
          }
        };
      }
    };
    BrowserWindow = Object.assign(
      class {
        webContents = new MockWebContents();
        constructor() {
          mockWindow = this;
        }
        static getFocusedWindow() {
          return mockWindow;
        }
        isDestroyed() {
          return false;
        }
        show() {
        }
        setAlwaysOnTop() {
        }
        on() {
        }
        loadFile() {
        }
        loadURL() {
        }
      },
      { getFocusedWindow: () => mockWindow }
    );
    shell = {
      openExternal() {
      },
      openPath() {
        return Promise.resolve("");
      },
      showItemInFolder() {
      }
    };
    Menu = {
      buildFromTemplate() {
        return { popup() {
        } };
      }
    };
    electronApp = { setAppUserModelId() {
    } };
    optimizer = { watchWindowShortcuts() {
    } };
  }
});

// core.ts
var core_exports = {};
function clampNoteSize(w, h) {
  const width = Number.isFinite(Number(w)) ? Number(w) : DEFAULT_NOTE_W;
  const height = Number.isFinite(Number(h)) ? Number(h) : DEFAULT_NOTE_H;
  return {
    w: Math.min(MAX_NOTE_W, Math.max(MIN_NOTE_W, Math.round(width))),
    h: Math.min(MAX_NOTE_H, Math.max(MIN_NOTE_H, Math.round(height)))
  };
}
function storePath() {
  return (0, import_path.join)(app.getPath("userData"), "stickers.json");
}
function clipboardStorePath() {
  return (0, import_path.join)(app.getPath("userData"), "clipboard-history.json");
}
function clipboardSpacesPath() {
  return (0, import_path.join)(app.getPath("userData"), "clipboard-spaces.json");
}
function workspacesPath() {
  return (0, import_path.join)(app.getPath("userData"), "workspaces.json");
}
function clipboardImageDir() {
  return (0, import_path.join)(app.getPath("userData"), "clipboard-images");
}
function stickerImageDir() {
  return (0, import_path.join)(app.getPath("userData"), "sticker-images");
}
function ensureDir(dir) {
  if (!(0, import_fs.existsSync)(dir)) (0, import_fs.mkdirSync)(dir, { recursive: true });
}
function defaultStickers() {
  const now = Date.now();
  return [
    {
      id: "demo-1",
      title: "",
      content: "user@example.com\n\u5BC6\u7801\uFF1Ademo123",
      color: "lemon",
      x: 48,
      y: 72,
      z: 1,
      w: DEFAULT_NOTE_W,
      h: DEFAULT_NOTE_H,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-2",
      title: "",
      content: "npm run dev",
      color: "mint",
      x: 300,
      y: 110,
      z: 2,
      w: DEFAULT_NOTE_W,
      h: DEFAULT_NOTE_H,
      createdAt: now,
      updatedAt: now
    }
  ];
}
function normalizeFolders(raw) {
  if (!Array.isArray(raw)) return [];
  const list = raw.filter((f) => f && typeof f === "object").slice(0, MAX_FOLDERS).map((f, i) => {
    const item = f;
    const parentId = item.parentId ? String(item.parentId) : void 0;
    return {
      id: String(item.id || uid()),
      name: String(item.name || `\u6587\u4EF6\u5939 ${i + 1}`).slice(0, 24),
      createdAt: Number(item.createdAt) || Date.now(),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : i,
      x: Number.isFinite(Number(item.x)) ? Number(item.x) : 48 + i % 4 * 180,
      y: Number.isFinite(Number(item.y)) ? Number(item.y) : 56 + Math.floor(i / 4) * 140,
      z: Number.isFinite(Number(item.z)) ? Number(item.z) : i + 1,
      parentId
    };
  });
  const ids = new Set(list.map((f) => f.id));
  for (const f of list) {
    if (f.parentId && (f.parentId === f.id || !ids.has(f.parentId))) {
      f.parentId = void 0;
    }
  }
  return list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}
function expandFolderSubtree(folders, rootIds) {
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && rootIds.has(f.parentId) && !rootIds.has(f.id)) {
        rootIds.add(f.id);
        grew = true;
      }
    }
  }
  return rootIds;
}
function normalizeStickers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s === "object").map((s) => {
    const item = s;
    const size = clampNoteSize(item.w ?? item.width, item.h ?? item.height);
    return {
      id: String(item.id || uid()),
      title: String(item.title || ""),
      content: String(item.content || ""),
      color: COLORS.includes(item.color) ? item.color : "lemon",
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      z: Number(item.z) || 1,
      w: size.w,
      h: size.h,
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      imageFile: item.imageFile ? String(item.imageFile) : void 0,
      folderId: item.folderId ? String(item.folderId) : void 0
    };
  });
}
function stickersView(list) {
  return list.map((s) => ({
    ...s,
    imageDataUrl: stickerImageDataUrl(s.imageFile)
  }));
}
function activeWorkspace() {
  let ws = workspaces.find((w) => w.id === activeSpaceId);
  if (!ws) {
    ws = workspaces[0];
    activeSpaceId = ws?.id || "default";
  }
  if (!ws) {
    ws = {
      id: "default",
      name: "\u9ED8\u8BA4",
      createdAt: Date.now(),
      stickers: defaultStickers(),
      clipboard: [],
      folders: []
    };
    workspaces = [ws];
    activeSpaceId = ws.id;
  }
  if (!Array.isArray(ws.folders)) ws.folders = [];
  return ws;
}
function readState() {
  syncActiveIntoWorkspaces();
  const ws = activeWorkspace();
  maxZ = Math.max(1, ...ws.stickers.map((s) => s.z || 1), 1);
  return {
    alwaysOnTop: alwaysOnTopFlag,
    stickers: ws.stickers,
    folders: ws.folders
  };
}
function writeState(state, spaceId) {
  alwaysOnTopFlag = Boolean(state.alwaysOnTop);
  const ws = spaceId && workspaces.find((w) => w.id === spaceId) || activeWorkspace();
  ws.stickers = normalizeStickers(state.stickers);
  if (Array.isArray(state.folders)) {
    ws.folders = normalizeFolders(state.folders);
  }
  if (ws.id === activeSpaceId) {
    maxZ = Math.max(1, ...ws.stickers.map((s) => s.z || 1), 1);
  }
  persistWorkspaces();
}
function commitSpaceBoard(spaceId, stickers, folders) {
  const ws = workspaces.find((w) => w.id === spaceId);
  if (!ws) return false;
  if (Array.isArray(stickers)) ws.stickers = normalizeStickers(stickers);
  if (Array.isArray(folders)) ws.folders = normalizeFolders(folders);
  persistWorkspaces();
  return true;
}
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function hashBuffer(buf) {
  return (0, import_crypto.createHash)("sha1").update(buf).digest("hex");
}
function imagePathFor(fileName) {
  return (0, import_path.join)(clipboardImageDir(), fileName);
}
function toDataUrl(fileName) {
  if (!fileName) return void 0;
  const full = imagePathFor(fileName);
  if (!(0, import_fs.existsSync)(full)) return void 0;
  const buf = (0, import_fs.readFileSync)(full);
  return `data:image/png;base64,${buf.toString("base64")}`;
}
function toView(item) {
  if (item.kind !== "image") return { ...item };
  return {
    ...item,
    imageDataUrl: toDataUrl(item.imageFile)
  };
}
function historyViews() {
  return clipboardHistory.map(toView);
}
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw;
    const kind = item.kind === "image" ? "image" : "text";
    if (kind === "image" && !item.imageFile) continue;
    if (kind === "text" && !String(item.text || "").trim()) continue;
    out.push({
      id: String(item.id || uid()),
      kind,
      text: String(item.text || ""),
      imageFile: item.imageFile ? String(item.imageFile) : void 0,
      fingerprint: String(
        item.fingerprint || (kind === "image" ? `img:${item.imageFile}` : `text:${item.text}`)
      ),
      createdAt: Number(item.createdAt) || Date.now()
    });
    if (out.length >= MAX_CLIPBOARD_HISTORY) break;
  }
  return out;
}
function slimItems(items) {
  return items.map(({ id, kind, text, imageFile, fingerprint, createdAt }) => ({
    id,
    kind,
    text,
    imageFile,
    fingerprint,
    createdAt
  }));
}
function workspaceMetas() {
  syncActiveIntoWorkspaces();
  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt,
    stickerCount: w.stickers.length,
    clipCount: w.id === activeSpaceId ? clipboardHistory.length : w.clipboard.length,
    count: w.id === activeSpaceId ? clipboardHistory.length : w.clipboard.length
  }));
}
function syncActiveIntoWorkspaces() {
  const ws = workspaces.find((w) => w.id === activeSpaceId);
  if (ws) ws.clipboard = clipboardHistory;
}
function loadActiveFromWorkspaces() {
  const ws = activeWorkspace();
  clipboardHistory = [...ws.clipboard];
  maxZ = Math.max(1, ...ws.stickers.map((s) => s.z || 1), 1);
}
function syncFingerprintToSystem() {
  const snap = readSystemSnapshot();
  lastFingerprint = snap?.fingerprint || "";
}
function persistWorkspaces() {
  ensureDir(app.getPath("userData"));
  syncActiveIntoWorkspaces();
  const payload = {
    version: 1,
    activeWorkspaceId: activeSpaceId,
    alwaysOnTop: alwaysOnTopFlag,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt,
      folders: normalizeFolders(w.folders),
      stickers: w.stickers,
      clipboard: slimItems(w.clipboard)
    }))
  };
  (0, import_fs.writeFileSync)(workspacesPath(), JSON.stringify(payload, null, 2), "utf8");
}
function readLegacyBoard() {
  const file = storePath();
  if (!(0, import_fs.existsSync)(file)) {
    return { alwaysOnTop: true, stickers: defaultStickers() };
  }
  try {
    const raw = JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
    if (!raw || !Array.isArray(raw.stickers)) {
      return { alwaysOnTop: true, stickers: defaultStickers() };
    }
    return {
      alwaysOnTop: Boolean(raw.alwaysOnTop),
      stickers: normalizeStickers(raw.stickers)
    };
  } catch {
    return { alwaysOnTop: true, stickers: defaultStickers() };
  }
}
function readLegacyClipboardHistory() {
  const file = clipboardStorePath();
  if (!(0, import_fs.existsSync)(file)) return [];
  try {
    const raw = JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
    return normalizeItems(raw.items);
  } catch {
    return [];
  }
}
function workspaceSnapshot() {
  const ws = activeWorkspace();
  return {
    activeSpaceId,
    spaces: workspaceMetas(),
    history: historyViews(),
    stickers: stickersView(ws.stickers),
    folders: normalizeFolders(ws.folders),
    alwaysOnTop: alwaysOnTopFlag
  };
}
function loadWorkspaces() {
  const file = workspacesPath();
  if ((0, import_fs.existsSync)(file)) {
    try {
      const raw = JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
      if (Array.isArray(raw.workspaces) && raw.workspaces.length > 0) {
        alwaysOnTopFlag = raw.alwaysOnTop !== false;
        workspaces = raw.workspaces.map((w, i) => ({
          id: String(w.id || `space-${i}`),
          name: String(w.name || `\u7A7A\u95F4 ${i + 1}`).slice(0, 24),
          createdAt: Number(w.createdAt) || Date.now(),
          folders: normalizeFolders(w.folders),
          stickers: normalizeStickers(w.stickers),
          clipboard: normalizeItems(w.clipboard)
        }));
        activeSpaceId = String(raw.activeWorkspaceId || workspaces[0].id);
        loadActiveFromWorkspaces();
        return;
      }
    } catch {
    }
  }
  const board = readLegacyBoard();
  alwaysOnTopFlag = board.alwaysOnTop;
  const spacesFile = clipboardSpacesPath();
  if ((0, import_fs.existsSync)(spacesFile)) {
    try {
      const raw = JSON.parse((0, import_fs.readFileSync)(spacesFile, "utf8"));
      if (Array.isArray(raw.spaces) && raw.spaces.length > 0) {
        const activeId = String(raw.activeSpaceId || raw.spaces[0].id || "default");
        workspaces = raw.spaces.map((s, i) => {
          const id = String(s.id || `space-${i}`);
          return {
            id,
            name: String(s.name || `\u7A7A\u95F4 ${i + 1}`).slice(0, 24),
            createdAt: Number(s.createdAt) || Date.now(),
            folders: [],
            stickers: id === activeId ? board.stickers : [],
            clipboard: normalizeItems(s.items)
          };
        });
        activeSpaceId = activeId;
        loadActiveFromWorkspaces();
        persistWorkspaces();
        return;
      }
    } catch {
    }
  }
  const legacyClip = readLegacyClipboardHistory();
  workspaces = [
    {
      id: "default",
      name: "\u9ED8\u8BA4",
      createdAt: Date.now(),
      folders: [],
      stickers: board.stickers,
      clipboard: legacyClip
    }
  ];
  activeSpaceId = "default";
  clipboardHistory = [...legacyClip];
  persistWorkspaces();
}
function writeClipboardHistory(items) {
  clipboardHistory = items;
  persistWorkspaces();
}
function deleteImageFile(fileName) {
  if (!fileName) return;
  const full = imagePathFor(fileName);
  if ((0, import_fs.existsSync)(full)) {
    try {
      (0, import_fs.unlinkSync)(full);
    } catch {
    }
  }
}
function imageStillUsed(fileName, exceptIds) {
  if (!fileName) return false;
  syncActiveIntoWorkspaces();
  for (const space of workspaces) {
    for (const item of space.clipboard) {
      if (exceptIds?.has(item.id)) continue;
      if (item.kind === "image" && item.imageFile === fileName) return true;
    }
  }
  return false;
}
function pruneRemovedImages(removed) {
  for (const item of removed) {
    if (item.kind === "image" && item.imageFile && !imageStillUsed(item.imageFile, /* @__PURE__ */ new Set([item.id]))) {
      deleteImageFile(item.imageFile);
    }
  }
}
function applyAlwaysOnTop(enabled) {
  alwaysOnTopFlag = enabled;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(enabled, "screen-saver");
}
function sendClipboardHistory() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("clipboard:history", historyViews());
  mainWindow.webContents.send("clipboard:spaces", {
    activeSpaceId,
    spaces: workspaceMetas()
  });
  mainWindow.webContents.send("workspace:changed", workspaceSnapshot());
}
function createClipboardSpace(name) {
  if (workspaces.length >= MAX_WORKSPACES) {
    throw new Error(`\u6700\u591A ${MAX_WORKSPACES} \u4E2A\u7A7A\u95F4`);
  }
  syncActiveIntoWorkspaces();
  const n = workspaces.length + 1;
  const space = {
    id: uid(),
    name: (name?.trim() || `\u7A7A\u95F4 ${n}`).slice(0, 24),
    createdAt: Date.now(),
    folders: [],
    stickers: [],
    clipboard: []
  };
  workspaces.push(space);
  activeSpaceId = space.id;
  clipboardHistory = [];
  maxZ = 1;
  syncFingerprintToSystem();
  persistWorkspaces();
  sendClipboardHistory();
  return workspaceSnapshot();
}
function switchClipboardSpace(id) {
  const target = workspaces.find((s) => s.id === id);
  if (!target) throw new Error("\u7A7A\u95F4\u4E0D\u5B58\u5728");
  if (id === activeSpaceId) {
    return workspaceSnapshot();
  }
  syncActiveIntoWorkspaces();
  activeSpaceId = id;
  loadActiveFromWorkspaces();
  syncFingerprintToSystem();
  persistWorkspaces();
  sendClipboardHistory();
  return workspaceSnapshot();
}
function renameClipboardSpace(id, name) {
  const sp = workspaces.find((s) => s.id === id);
  if (!sp) throw new Error("\u7A7A\u95F4\u4E0D\u5B58\u5728");
  const next = name.trim().slice(0, 24);
  if (!next) throw new Error("\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
  sp.name = next;
  persistWorkspaces();
  sendClipboardHistory();
  return workspaceSnapshot();
}
function deleteClipboardSpace(id) {
  if (workspaces.length <= 1) {
    throw new Error("\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u7A7A\u95F4");
  }
  const idx = workspaces.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error("\u7A7A\u95F4\u4E0D\u5B58\u5728");
  syncActiveIntoWorkspaces();
  const [removed] = workspaces.splice(idx, 1);
  pruneRemovedImages(removed.clipboard);
  for (const s of removed.stickers) {
    deleteStickerImageFile(s.imageFile);
  }
  if (activeSpaceId === id) {
    activeSpaceId = workspaces[Math.max(0, idx - 1)].id;
    loadActiveFromWorkspaces();
    syncFingerprintToSystem();
  }
  persistWorkspaces();
  sendClipboardHistory();
  return workspaceSnapshot();
}
function deleteStickerImageFile(fileName) {
  if (!fileName) return;
  const full = (0, import_path.join)(stickerImageDir(), fileName);
  if ((0, import_fs.existsSync)(full)) {
    try {
      (0, import_fs.unlinkSync)(full);
    } catch {
    }
  }
}
function moveItemsToSpace(payload) {
  const toId = String(payload.toSpaceId || "");
  const fromId = String(payload.fromSpaceId || activeSpaceId);
  const from = workspaces.find((w) => w.id === fromId);
  const to = workspaces.find((w) => w.id === toId);
  if (!from) throw new Error("\u6E90\u7A7A\u95F4\u4E0D\u5B58\u5728");
  if (!to) throw new Error("\u76EE\u6807\u7A7A\u95F4\u4E0D\u5B58\u5728");
  if (from.id === to.id) throw new Error("\u5DF2\u5728\u8BE5\u7A7A\u95F4");
  const folderIds = expandFolderSubtree(
    from.folders,
    new Set((Array.isArray(payload.folderIds) ? payload.folderIds : []).map(String))
  );
  const stickerIds = new Set(
    (Array.isArray(payload.stickerIds) ? payload.stickerIds : []).map(String)
  );
  for (const s of from.stickers) {
    if (s.folderId && folderIds.has(s.folderId)) stickerIds.add(s.id);
  }
  if (folderIds.size === 0 && stickerIds.size === 0) {
    throw new Error("\u6CA1\u6709\u53EF\u79FB\u52A8\u7684\u5185\u5BB9");
  }
  const movingFolders = from.folders.filter((f) => folderIds.has(f.id));
  if (to.folders.length + movingFolders.length > MAX_FOLDERS) {
    throw new Error(`\u76EE\u6807\u7A7A\u95F4\u6587\u4EF6\u5939\u5DF2\u6EE1\uFF08\u6700\u591A ${MAX_FOLDERS} \u4E2A\uFF09`);
  }
  const movingStickers = from.stickers.filter((s) => stickerIds.has(s.id));
  from.folders = from.folders.filter((f) => !folderIds.has(f.id));
  from.stickers = from.stickers.filter((s) => !stickerIds.has(s.id));
  let z = Math.max(
    0,
    ...to.stickers.map((s) => s.z || 0),
    ...to.folders.map((f) => f.z || 0)
  ) + 1;
  const desktopCount = to.folders.filter((f) => !f.parentId).length + to.stickers.filter((s) => !s.folderId).length;
  let rootIdx = 0;
  for (const folder of movingFolders) {
    const keepParent = Boolean(folder.parentId && folderIds.has(folder.parentId));
    const isRoot = !keepParent;
    const idx = desktopCount + rootIdx;
    if (isRoot) rootIdx += 1;
    to.folders.push({
      ...folder,
      parentId: keepParent ? folder.parentId : void 0,
      x: isRoot ? 48 + idx % 4 * 180 : folder.x,
      y: isRoot ? 56 + Math.floor(idx / 4) * 140 : folder.y,
      z: z++,
      order: to.folders.length
    });
  }
  for (const [i, sticker] of movingStickers.entries()) {
    const keepFolder = Boolean(sticker.folderId && folderIds.has(sticker.folderId));
    const idx = desktopCount + rootIdx + i;
    to.stickers.push({
      ...sticker,
      folderId: keepFolder ? sticker.folderId : void 0,
      // 单独移动的贴纸落到目标桌面；夹内贴纸保持相对坐标
      x: keepFolder ? sticker.x : 48 + idx % 5 * 220,
      y: keepFolder ? sticker.y : 72 + Math.floor(idx / 5) * 170,
      z: z++,
      updatedAt: Date.now()
    });
  }
  if (from.id === activeSpaceId) {
    maxZ = Math.max(1, ...from.stickers.map((s) => s.z || 1), 1);
  }
  persistWorkspaces();
  sendClipboardHistory();
  return workspaceSnapshot();
}
function clearActiveWorkspace() {
  syncActiveIntoWorkspaces();
  const ws = activeWorkspace();
  const removedClip = [...clipboardHistory];
  const removedStickers = [...ws.stickers];
  ws.stickers = [];
  ws.folders = [];
  clipboardHistory = [];
  ws.clipboard = [];
  pruneRemovedImages(removedClip);
  for (const s of removedStickers) {
    deleteStickerImageFile(s.imageFile);
  }
  maxZ = 1;
  syncFingerprintToSystem();
  persistWorkspaces();
  sendClipboardHistory();
  return workspaceSnapshot();
}
function reorderClipboardSpaces(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error("\u65E0\u6548\u7684\u6392\u5E8F");
  }
  syncActiveIntoWorkspaces();
  const map = new Map(workspaces.map((w) => [w.id, w]));
  const next = [];
  for (const id of orderedIds) {
    const w = map.get(String(id));
    if (w) {
      next.push(w);
      map.delete(String(id));
    }
  }
  for (const w of map.values()) next.push(w);
  if (next.length !== workspaces.length) {
    throw new Error("\u6392\u5E8F\u7ED3\u679C\u4E0D\u5B8C\u6574");
  }
  workspaces = next;
  persistWorkspaces();
  sendClipboardHistory();
  return workspaceSnapshot();
}
function savePng(buffer, id = uid()) {
  ensureDir(clipboardImageDir());
  const fileName = `${id}.png`;
  (0, import_fs.writeFileSync)(imagePathFor(fileName), buffer);
  return fileName;
}
function rememberItem(item) {
  const fingerprint = item.fingerprint;
  if (!fingerprint) return clipboardHistory;
  const existing = clipboardHistory.find((x) => x.fingerprint === fingerprint);
  if (existing) {
    clipboardHistory = [
      { ...existing, createdAt: Date.now() },
      ...clipboardHistory.filter((x) => x.id !== existing.id)
    ];
    lastFingerprint = fingerprint;
    writeClipboardHistory(clipboardHistory);
    sendClipboardHistory();
    return clipboardHistory;
  }
  const id = item.id || uid();
  const next = {
    id,
    kind: item.kind,
    text: item.text || "",
    imageFile: item.imageFile,
    fingerprint,
    createdAt: item.createdAt || Date.now()
  };
  const dropped = clipboardHistory.slice(MAX_CLIPBOARD_HISTORY - 1);
  clipboardHistory = [next, ...clipboardHistory].slice(0, MAX_CLIPBOARD_HISTORY);
  pruneRemovedImages(dropped.filter((d) => !clipboardHistory.some((h) => h.id === d.id)));
  lastFingerprint = fingerprint;
  writeClipboardHistory(clipboardHistory);
  sendClipboardHistory();
  return clipboardHistory;
}
function readSystemSnapshot() {
  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const png = image.toPNG();
    if (png.length > 0) {
      return {
        kind: "image",
        text: "",
        png: Buffer.from(png),
        fingerprint: `img:${hashBuffer(Buffer.from(png))}`
      };
    }
  }
  const text = clipboard.readText();
  if (text.trim()) {
    return {
      kind: "text",
      text,
      fingerprint: `text:${text}`
    };
  }
  return null;
}
function captureSystemClipboard(force = false) {
  const snap = readSystemSnapshot();
  if (!snap) {
    if (force) sendClipboardHistory();
    return { ok: false, reason: "empty", history: historyViews() };
  }
  if (!force && snap.fingerprint === lastFingerprint) {
    return { ok: true, reason: "same", history: historyViews() };
  }
  if (snap.kind === "image" && snap.png) {
    const id = uid();
    const imageFile = savePng(snap.png, id);
    rememberItem({
      id,
      kind: "image",
      text: "",
      imageFile,
      fingerprint: snap.fingerprint
    });
  } else {
    rememberItem({
      kind: "text",
      text: snap.text,
      fingerprint: snap.fingerprint
    });
  }
  return { ok: true, reason: "added", history: historyViews() };
}
function pollClipboard() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  captureSystemClipboard(false);
}
function startClipboardWatch() {
  if (clipboardTimer) return;
  const snap = readSystemSnapshot();
  lastFingerprint = snap?.fingerprint || "";
  if (snap && clipboardHistory[0]?.fingerprint !== snap.fingerprint) {
    captureSystemClipboard(true);
  } else {
    sendClipboardHistory();
  }
  clipboardTimer = setInterval(() => pollClipboard(), 400);
}
function writeItemToClipboard(item) {
  if (item.kind === "image" && item.imageFile) {
    const full = imagePathFor(item.imageFile);
    if (!(0, import_fs.existsSync)(full)) throw new Error("\u56FE\u7247\u6587\u4EF6\u4E0D\u5B58\u5728");
    clipboard.writeImage(nativeImage.createFromPath(full));
  } else {
    clipboard.writeText(item.text || "");
  }
  lastFingerprint = item.fingerprint;
}
function copyImageFileToStickers(sourceFile) {
  if (!sourceFile) return void 0;
  const src = imagePathFor(sourceFile);
  if (!(0, import_fs.existsSync)(src)) return void 0;
  ensureDir(stickerImageDir());
  const fileName = `${uid()}.png`;
  (0, import_fs.writeFileSync)((0, import_path.join)(stickerImageDir(), fileName), (0, import_fs.readFileSync)(src));
  return fileName;
}
function stickerImageDataUrl(fileName) {
  if (!fileName) return void 0;
  const full = (0, import_path.join)(stickerImageDir(), fileName);
  if (!(0, import_fs.existsSync)(full)) {
    return toDataUrl(fileName);
  }
  const buf = (0, import_fs.readFileSync)(full);
  return `data:image/png;base64,${buf.toString("base64")}`;
}
function createWindow(alwaysOnTop) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: "\u8D34\u7EB8\u677F",
    backgroundColor: "#2A3340",
    alwaysOnTop,
    webPreferences: {
      preload: (0, import_path.join)(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  if (alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  }
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    sendClipboardHistory();
  });
  mainWindow.on("focus", () => {
    pollClipboard();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const { editFlags } = params;
    const items = [];
    if (params.isEditable) {
      items.push(
        { label: "\u64A4\u9500", role: "undo", enabled: editFlags.canUndo },
        { label: "\u91CD\u505A", role: "redo", enabled: editFlags.canRedo },
        { type: "separator" },
        { label: "\u526A\u5207", role: "cut", enabled: editFlags.canCut },
        { label: "\u590D\u5236", role: "copy", enabled: editFlags.canCopy },
        { label: "\u7C98\u8D34", role: "paste", enabled: editFlags.canPaste },
        { label: "\u5220\u9664", role: "delete", enabled: editFlags.canDelete },
        { type: "separator" },
        { label: "\u5168\u9009", role: "selectAll", enabled: editFlags.canSelectAll }
      );
    } else {
      items.push({ label: "\u590D\u5236", role: "copy" });
    }
    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });
}
var import_path, import_fs, import_crypto, import_sharp, DEFAULT_NOTE_W, DEFAULT_NOTE_H, MIN_NOTE_W, MIN_NOTE_H, MAX_NOTE_W, MAX_NOTE_H, MAX_FOLDERS, COLORS, MAX_CLIPBOARD_HISTORY, MAX_WORKSPACES, mainWindow, maxZ, lastFingerprint, clipboardTimer, clipboardHistory, workspaces, activeSpaceId, alwaysOnTopFlag;
var init_core = __esm({
  "core.ts"() {
    "use strict";
    init_electron_shim();
    import_path = require("path");
    import_fs = require("fs");
    import_crypto = require("crypto");
    init_electron_shim();
    import_sharp = __toESM(require("sharp"), 1);
    DEFAULT_NOTE_W = 200;
    DEFAULT_NOTE_H = 148;
    MIN_NOTE_W = 140;
    MIN_NOTE_H = 100;
    MAX_NOTE_W = 720;
    MAX_NOTE_H = 640;
    MAX_FOLDERS = 48;
    COLORS = ["lemon", "mint", "sky", "peach", "lilac", "sand"];
    MAX_CLIPBOARD_HISTORY = 40;
    MAX_WORKSPACES = 12;
    mainWindow = null;
    maxZ = 1;
    lastFingerprint = "";
    clipboardTimer = null;
    clipboardHistory = [];
    workspaces = [];
    activeSpaceId = "default";
    alwaysOnTopFlag = true;
    app.whenReady().then(() => {
      electronApp.setAppUserModelId("com.codes.stickers");
      ensureDir(clipboardImageDir());
      ensureDir(stickerImageDir());
      app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window);
      });
      loadWorkspaces();
      const initial = readState();
      maxZ = Math.max(1, ...initial.stickers.map((s) => s.z || 1), 1);
      ipcMain.handle("board:load", () => {
        const state = readState();
        return {
          ...state,
          folders: normalizeFolders(state.folders),
          stickers: state.stickers.map((s) => ({
            ...s,
            imageDataUrl: stickerImageDataUrl(s.imageFile)
          }))
        };
      });
      ipcMain.handle(
        "board:save",
        (_e, state) => {
          if (!state || !Array.isArray(state.stickers)) {
            throw new Error("\u65E0\u6548\u7684\u8D34\u7EB8\u6570\u636E");
          }
          const targetId = state.spaceId ? String(state.spaceId) : activeSpaceId;
          if (state.spaceId && !workspaces.some((w) => w.id === targetId)) {
            return false;
          }
          const target = workspaces.find((w) => w.id === targetId) || activeWorkspace();
          writeState(
            {
              alwaysOnTop: Boolean(state.alwaysOnTop),
              folders: Array.isArray(state.folders) ? normalizeFolders(state.folders) : target.folders,
              stickers: state.stickers.map((s) => {
                const size = clampNoteSize(s.w, s.h);
                return {
                  id: s.id,
                  title: s.title || "",
                  content: s.content || "",
                  color: s.color,
                  x: s.x,
                  y: s.y,
                  z: s.z,
                  w: size.w,
                  h: size.h,
                  createdAt: s.createdAt,
                  updatedAt: s.updatedAt,
                  imageFile: s.imageFile,
                  folderId: s.folderId || void 0
                };
              })
            },
            targetId
          );
          applyAlwaysOnTop(Boolean(state.alwaysOnTop));
          return true;
        }
      );
      ipcMain.handle("board:setAlwaysOnTop", (_e, enabled) => {
        applyAlwaysOnTop(Boolean(enabled));
        persistWorkspaces();
        return alwaysOnTopFlag;
      });
      function appendSticker(payload) {
        const state = readState();
        maxZ += 1;
        const now = Date.now();
        let imageFile = payload?.imageFile;
        let content = payload?.content ?? "";
        if (payload?.fromClipboardId) {
          const clip = clipboardHistory.find((x) => x.id === payload.fromClipboardId);
          if (clip?.kind === "image") {
            imageFile = copyImageFileToStickers(clip.imageFile);
            content = content || "";
          } else if (clip?.kind === "text") {
            content = clip.text;
          }
        }
        if (payload?.png && payload.png.length > 0) {
          ensureDir(stickerImageDir());
          const fileName = `${uid()}.png`;
          (0, import_fs.writeFileSync)((0, import_path.join)(stickerImageDir(), fileName), payload.png);
          imageFile = fileName;
          content = content || "";
        }
        const folderId = payload?.folderId ? String(payload.folderId) : void 0;
        const size = clampNoteSize(payload?.w, payload?.h);
        const sticker = {
          id: uid(),
          title: payload?.title ? String(payload.title) : "",
          content,
          color: payload?.color && COLORS.includes(payload.color) ? payload.color : COLORS[state.stickers.length % COLORS.length],
          x: typeof payload?.x === "number" ? payload.x : 48 + state.stickers.length % 5 * 220,
          y: typeof payload?.y === "number" ? payload.y : 72 + state.stickers.length % 3 * 170,
          z: maxZ,
          w: size.w,
          h: size.h,
          createdAt: now,
          updatedAt: now,
          imageFile,
          folderId,
          imageDataUrl: stickerImageDataUrl(imageFile)
        };
        state.stickers.push({
          id: sticker.id,
          title: sticker.title,
          content: sticker.content,
          color: sticker.color,
          x: sticker.x,
          y: sticker.y,
          z: sticker.z,
          w: sticker.w,
          h: sticker.h,
          createdAt: sticker.createdAt,
          updatedAt: sticker.updatedAt,
          imageFile: sticker.imageFile,
          folderId: sticker.folderId
        });
        writeState({ ...state, folders: activeWorkspace().folders });
        return sticker;
      }
      ipcMain.handle("sticker:create", (_e, payload) => {
        return appendSticker(payload);
      });
      ipcMain.handle("sticker:fromClipboard", () => {
        const snap = readSystemSnapshot();
        if (!snap) {
          return { ok: false, reason: "empty", sticker: null };
        }
        if (snap.kind === "image" && snap.png) {
          const sticker2 = appendSticker({ png: snap.png, content: "" });
          return { ok: true, reason: "image", sticker: sticker2 };
        }
        const text = snap.text.trim();
        if (!text) {
          return { ok: false, reason: "empty", sticker: null };
        }
        const sticker = appendSticker({ content: text });
        return { ok: true, reason: "text", sticker };
      });
      ipcMain.handle(
        "sticker:fromImageData",
        (_e, base64Png, meta) => {
          const raw = String(base64Png || "").replace(/^data:image\/\w+;base64,/, "");
          const png = Buffer.from(raw, "base64");
          if (!png.length) {
            return { ok: false, reason: "invalid", sticker: null };
          }
          const sticker = appendSticker({
            png,
            content: "",
            folderId: meta?.folderId,
            x: meta?.x,
            y: meta?.y
          });
          return { ok: true, reason: "image", sticker };
        }
      );
      function resolveStickerImagePath(imageFile) {
        const src = (0, import_path.join)(stickerImageDir(), imageFile);
        if ((0, import_fs.existsSync)(src)) return src;
        const alt = imagePathFor(imageFile);
        if ((0, import_fs.existsSync)(alt)) return alt;
        return null;
      }
      function safeExportFileName(name, fallback) {
        const cleaned = String(name || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
        return cleaned || fallback;
      }
      ipcMain.handle("sticker:saveImage", async (_e, stickerId, filePath) => {
        syncActiveIntoWorkspaces();
        const sticker = activeWorkspace().stickers.find((s) => s.id === stickerId);
        if (!sticker?.imageFile) {
          return { ok: false, reason: "not-image", path: null };
        }
        const src = resolveStickerImagePath(sticker.imageFile);
        if (!src) {
          return { ok: false, reason: "missing", path: null };
        }
        const dest = filePath?.trim();
        if (!dest) {
          return { ok: false, reason: "cancel", path: null };
        }
        (0, import_fs.copyFileSync)(src, dest);
        return { ok: true, reason: "saved", path: dest };
      });
      ipcMain.handle("sticker:saveVisibleImages", async (_e, stickerIds, dirPath) => {
        syncActiveIntoWorkspaces();
        const idSet = new Set((Array.isArray(stickerIds) ? stickerIds : []).map(String));
        const images = activeWorkspace().stickers.filter(
          (s) => idSet.has(s.id) && s.imageFile
        );
        if (!images.length) {
          return {
            ok: false,
            reason: "empty",
            dir: null,
            saved: 0,
            skipped: 0
          };
        }
        const dir = dirPath?.trim();
        if (!dir) {
          return {
            ok: false,
            reason: "cancel",
            dir: null,
            saved: 0,
            skipped: 0
          };
        }
        const used = /* @__PURE__ */ new Set();
        let saved = 0;
        let skipped = 0;
        for (const [i, sticker] of images.entries()) {
          const src = resolveStickerImagePath(sticker.imageFile);
          if (!src) {
            skipped += 1;
            continue;
          }
          const base = safeExportFileName(sticker.title || "", `\u8D34\u7EB8-${i + 1}`);
          let fileName = `${base}.png`;
          let n = 2;
          while (used.has(fileName.toLowerCase()) || (0, import_fs.existsSync)((0, import_path.join)(dir, fileName))) {
            fileName = `${base}-${n}.png`;
            n += 1;
          }
          used.add(fileName.toLowerCase());
          (0, import_fs.copyFileSync)(src, (0, import_path.join)(dir, fileName));
          saved += 1;
        }
        if (saved > 0) {
          try {
            await shell.openPath(dir);
          } catch {
          }
        }
        return {
          ok: saved > 0,
          reason: saved > 0 ? "saved" : "none",
          dir,
          saved,
          skipped
        };
      });
      const IMAGE_EXTS = /* @__PURE__ */ new Set([
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".bmp",
        ".ico",
        ".tif",
        ".tiff"
      ]);
      const TEXT_EXTS = /* @__PURE__ */ new Set([
        ".txt",
        ".md",
        ".json",
        ".csv",
        ".log",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".css",
        ".html",
        ".xml",
        ".yml",
        ".yaml",
        ".ini",
        ".env"
      ]);
      ipcMain.handle(
        "sticker:fromFiles",
        async (_e, items) => {
          if (!Array.isArray(items) || items.length === 0) {
            return { ok: false, reason: "empty", stickers: [] };
          }
          const created = [];
          for (const [i, item] of items.entries()) {
            const filePath = String(item.path || "");
            if (!filePath || !(0, import_fs.existsSync)(filePath)) continue;
            const ext = (0, import_path.extname)(filePath).toLowerCase();
            const x = typeof item.x === "number" ? item.x + i % 4 * 24 : void 0;
            const y = typeof item.y === "number" ? item.y + Math.floor(i / 4) * 24 : void 0;
            const folderId = item.folderId;
            if (IMAGE_EXTS.has(ext)) {
              let png;
              try {
                png = await (0, import_sharp.default)(filePath, { failOn: "none" }).rotate().png().toBuffer();
              } catch {
                continue;
              }
              if (!png.length) continue;
              created.push(
                appendSticker({
                  png,
                  content: "",
                  title: (0, import_path.basename)(filePath),
                  folderId,
                  x,
                  y
                })
              );
              continue;
            }
            if (TEXT_EXTS.has(ext)) {
              try {
                const text = (0, import_fs.readFileSync)(filePath, "utf8").slice(0, 24e3);
                if (!text.trim()) continue;
                created.push(
                  appendSticker({
                    content: text,
                    title: (0, import_path.basename)(filePath),
                    folderId,
                    x,
                    y
                  })
                );
              } catch {
              }
              continue;
            }
            created.push(
              appendSticker({
                content: `${(0, import_path.basename)(filePath)}
${filePath}`,
                title: (0, import_path.basename)(filePath),
                folderId,
                x,
                y
              })
            );
          }
          return {
            ok: created.length > 0,
            reason: created.length ? "added" : "none",
            stickers: created
          };
        }
      );
      ipcMain.handle("clipboard:read", () => clipboard.readText());
      ipcMain.handle("clipboard:history", () => historyViews());
      ipcMain.handle("clipboard:spaces", () => ({
        activeSpaceId,
        spaces: workspaceMetas()
      }));
      ipcMain.handle("workspace:snapshot", () => workspaceSnapshot());
      ipcMain.handle("workspace:clear", () => clearActiveWorkspace());
      ipcMain.handle(
        "workspace:moveItems",
        (_e, payload) => moveItemsToSpace(payload || { toSpaceId: "" })
      );
      ipcMain.handle(
        "clipboard:createSpace",
        (_e, name, stickers, fromSpaceId, folders) => {
          commitSpaceBoard(
            String(fromSpaceId || activeSpaceId),
            stickers,
            folders
          );
          return createClipboardSpace(name);
        }
      );
      ipcMain.handle(
        "clipboard:switchSpace",
        (_e, id, stickers, fromSpaceId, folders) => {
          commitSpaceBoard(
            String(fromSpaceId || activeSpaceId),
            stickers,
            folders
          );
          return switchClipboardSpace(String(id || ""));
        }
      );
      ipcMain.handle("clipboard:renameSpace", (_e, id, name) => {
        return renameClipboardSpace(String(id || ""), String(name || ""));
      });
      ipcMain.handle("clipboard:reorderSpaces", (_e, orderedIds) => {
        return reorderClipboardSpaces(Array.isArray(orderedIds) ? orderedIds : []);
      });
      ipcMain.handle(
        "clipboard:deleteSpace",
        (_e, id, stickers, fromSpaceId, folders) => {
          commitSpaceBoard(
            String(fromSpaceId || activeSpaceId),
            stickers,
            folders
          );
          return deleteClipboardSpace(String(id || ""));
        }
      );
      ipcMain.handle("clipboard:capture", () => captureSystemClipboard(true));
      ipcMain.handle("clipboard:remove", (_e, id) => {
        const removed = clipboardHistory.filter((item) => item.id === id);
        clipboardHistory = clipboardHistory.filter((item) => item.id !== id);
        pruneRemovedImages(removed);
        writeClipboardHistory(clipboardHistory);
        sendClipboardHistory();
        return historyViews();
      });
      ipcMain.handle("clipboard:clear", () => {
        const removed = clipboardHistory;
        clipboardHistory = [];
        pruneRemovedImages(removed);
        writeClipboardHistory(clipboardHistory);
        sendClipboardHistory();
        return historyViews();
      });
      ipcMain.handle("clipboard:write", (_e, text) => {
        const value = String(text ?? "");
        clipboard.writeText(value);
        if (value.trim()) {
          rememberItem({
            kind: "text",
            text: value,
            fingerprint: `text:${value}`
          });
        }
        return true;
      });
      ipcMain.handle("clipboard:writeItem", (_e, id) => {
        const item = clipboardHistory.find((x) => x.id === id);
        if (!item) throw new Error("\u5386\u53F2\u9879\u4E0D\u5B58\u5728");
        writeItemToClipboard(item);
        rememberItem(item);
        return true;
      });
      ipcMain.handle("clipboard:importImage", (_e, base64Png) => {
        const raw = String(base64Png || "").replace(/^data:image\/\w+;base64,/, "");
        const png = Buffer.from(raw, "base64");
        if (!png.length) throw new Error("\u65E0\u6548\u56FE\u7247");
        const fingerprint = `img:${hashBuffer(png)}`;
        const id = uid();
        const imageFile = savePng(png, id);
        rememberItem({
          id,
          kind: "image",
          text: "",
          imageFile,
          fingerprint
        });
        clipboard.writeImage(nativeImage.createFromBuffer(png));
        lastFingerprint = fingerprint;
        return historyViews();
      });
      ipcMain.handle("clipboard:export", async (_e, stickers, filePath) => {
        if (Array.isArray(stickers)) {
          activeWorkspace().stickers = normalizeStickers(stickers);
          persistWorkspaces();
        }
        syncActiveIntoWorkspaces();
        const ws = activeWorkspace();
        if (ws.stickers.length === 0 && clipboardHistory.length === 0) {
          return {
            ok: false,
            reason: "empty",
            path: null,
            count: 0,
            stickerCount: 0,
            clipCount: 0
          };
        }
        const clipItems = clipboardHistory.map((item) => {
          if (item.kind === "image" && item.imageFile) {
            const full = imagePathFor(item.imageFile);
            const imageBase64 = (0, import_fs.existsSync)(full) ? (0, import_fs.readFileSync)(full).toString("base64") : "";
            return {
              kind: "image",
              text: item.text || "",
              imageBase64,
              fingerprint: item.fingerprint,
              createdAt: item.createdAt
            };
          }
          return {
            kind: "text",
            text: item.text || "",
            fingerprint: item.fingerprint,
            createdAt: item.createdAt
          };
        });
        const stickerItems = ws.stickers.map((s) => {
          let imageBase64;
          if (s.imageFile) {
            const full = (0, import_path.join)(stickerImageDir(), s.imageFile);
            if ((0, import_fs.existsSync)(full)) imageBase64 = (0, import_fs.readFileSync)(full).toString("base64");
            else {
              const clipFull = imagePathFor(s.imageFile);
              if ((0, import_fs.existsSync)(clipFull)) imageBase64 = (0, import_fs.readFileSync)(clipFull).toString("base64");
            }
          }
          return {
            title: s.title,
            content: s.content,
            color: s.color,
            x: s.x,
            y: s.y,
            z: s.z,
            w: s.w,
            h: s.h,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            folderId: s.folderId,
            imageBase64
          };
        });
        const pack = {
          format: "stickers-workspace",
          version: 1,
          spaceName: ws.name,
          exportedAt: Date.now(),
          folders: normalizeFolders(ws.folders),
          stickers: stickerItems,
          clipboard: clipItems
        };
        const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const safeName = ws.name.replace(/[\\/:*?"<>|]/g, "_");
        const chosen = filePath?.trim();
        const res = chosen ? { canceled: false, filePath: chosen } : { canceled: true, filePath: void 0 };
        if (res.canceled || !res.filePath) {
          return {
            ok: false,
            reason: "cancel",
            path: null,
            count: 0,
            stickerCount: 0,
            clipCount: 0
          };
        }
        (0, import_fs.writeFileSync)(res.filePath, JSON.stringify(pack, null, 2), "utf8");
        return {
          ok: true,
          reason: "saved",
          path: res.filePath,
          count: stickerItems.length + clipItems.length,
          stickerCount: stickerItems.length,
          clipCount: clipItems.length
        };
      });
      ipcMain.handle("clipboard:importPack", async (_e, importPath) => {
        const res = importPath?.trim() ? { canceled: false, filePaths: [importPath.trim()] } : { canceled: true, filePaths: [] };
        if (res.canceled || !res.filePaths[0]) {
          return {
            ok: false,
            reason: "cancel",
            added: 0,
            skipped: 0,
            history: historyViews(),
            snapshot: workspaceSnapshot()
          };
        }
        let raw;
        try {
          raw = JSON.parse((0, import_fs.readFileSync)(res.filePaths[0], "utf8"));
        } catch {
          throw new Error("\u65E0\u6CD5\u89E3\u6790\u5BFC\u51FA\u6587\u4EF6");
        }
        const pack = raw;
        if (pack.format === "stickers-workspace" || Array.isArray(pack.stickers)) {
          if (workspaces.length >= MAX_WORKSPACES) {
            throw new Error(`\u6700\u591A ${MAX_WORKSPACES} \u4E2A\u7A7A\u95F4\uFF0C\u8BF7\u5148\u5220\u9664\u4E00\u4E2A\u518D\u5BFC\u5165`);
          }
          syncActiveIntoWorkspaces();
          const folderIdMap = /* @__PURE__ */ new Map();
          const importedFolders = [];
          for (const [i, src] of (pack.folders || []).entries()) {
            const oldId = String(src.id || "");
            const newId = uid();
            if (oldId) folderIdMap.set(oldId, newId);
            importedFolders.push({
              id: newId,
              name: String(src.name || `\u6587\u4EF6\u5939 ${i + 1}`).slice(0, 24),
              createdAt: Number(src.createdAt) || Date.now(),
              order: Number.isFinite(Number(src.order)) ? Number(src.order) : i,
              x: Number.isFinite(Number(src.x)) ? Number(src.x) : 48 + i % 4 * 180,
              y: Number.isFinite(Number(src.y)) ? Number(src.y) : 56 + Math.floor(i / 4) * 140,
              z: Number.isFinite(Number(src.z)) ? Number(src.z) : i + 1,
              // parentId 稍后按映射回填
              parentId: src.parentId ? String(src.parentId) : void 0
            });
          }
          for (const f of importedFolders) {
            if (!f.parentId) continue;
            const mapped = folderIdMap.get(f.parentId);
            f.parentId = mapped && mapped !== f.id ? mapped : void 0;
          }
          const importedStickers = [];
          for (const src of pack.stickers || []) {
            let imageFile;
            if (src.imageBase64) {
              const b64 = String(src.imageBase64).replace(/^data:image\/\w+;base64,/, "");
              const png = Buffer.from(b64, "base64");
              if (png.length) {
                ensureDir(stickerImageDir());
                imageFile = `${uid()}.png`;
                (0, import_fs.writeFileSync)((0, import_path.join)(stickerImageDir(), imageFile), png);
              }
            }
            const oldFolder = src.folderId ? String(src.folderId) : "";
            const size = clampNoteSize(src.w ?? src.width, src.h ?? src.height);
            importedStickers.push({
              id: uid(),
              title: String(src.title || ""),
              content: String(src.content || ""),
              color: COLORS.includes(src.color) ? src.color : "lemon",
              x: Number(src.x) || 48,
              y: Number(src.y) || 72,
              z: Number(src.z) || 1,
              w: size.w,
              h: size.h,
              createdAt: Number(src.createdAt) || Date.now(),
              updatedAt: Number(src.updatedAt) || Date.now(),
              imageFile,
              folderId: oldFolder ? folderIdMap.get(oldFolder) : void 0
            });
          }
          const importedClip = [];
          for (const src of pack.clipboard || []) {
            const kind = src.kind === "image" ? "image" : "text";
            if (kind === "image") {
              const b64 = String(src.imageBase64 || "").replace(/^data:image\/\w+;base64,/, "");
              if (!b64) continue;
              const png = Buffer.from(b64, "base64");
              if (!png.length) continue;
              const id = uid();
              importedClip.push({
                id,
                kind: "image",
                text: "",
                imageFile: savePng(png, id),
                fingerprint: String(src.fingerprint || `img:${hashBuffer(png)}`),
                createdAt: Number(src.createdAt) || Date.now()
              });
            } else {
              const text = String(src.text || "");
              if (!text.trim()) continue;
              importedClip.push({
                id: uid(),
                kind: "text",
                text,
                fingerprint: String(src.fingerprint || `text:${text}`),
                createdAt: Number(src.createdAt) || Date.now()
              });
            }
          }
          const space = {
            id: uid(),
            name: String(pack.spaceName || `\u5BFC\u5165 ${workspaces.length + 1}`).slice(0, 24),
            createdAt: Date.now(),
            folders: importedFolders,
            stickers: importedStickers,
            clipboard: importedClip.slice(0, MAX_CLIPBOARD_HISTORY)
          };
          workspaces.push(space);
          activeSpaceId = space.id;
          clipboardHistory = [...space.clipboard];
          maxZ = Math.max(1, ...space.stickers.map((s) => s.z || 1), 1);
          syncFingerprintToSystem();
          persistWorkspaces();
          sendClipboardHistory();
          return {
            ok: true,
            reason: "workspace",
            added: space.stickers.length + space.clipboard.length,
            skipped: 0,
            history: historyViews(),
            snapshot: workspaceSnapshot()
          };
        }
        const items = pack.items;
        if (!Array.isArray(items)) {
          throw new Error("\u4E0D\u662F\u6709\u6548\u7684\u8D34\u7EB8\u7A7A\u95F4\u5BFC\u51FA\u6587\u4EF6");
        }
        if (pack.format && pack.format !== "stickers-clipboard") {
          throw new Error("\u6587\u4EF6\u683C\u5F0F\u4E0D\u5339\u914D");
        }
        const existingFp = new Set(clipboardHistory.map((x) => x.fingerprint));
        let added = 0;
        let skipped = 0;
        for (const src of [...items].reverse()) {
          if (!src) continue;
          const kind = src.kind === "image" ? "image" : "text";
          if (kind === "image") {
            const b64 = String(src.imageBase64 || "").replace(/^data:image\/\w+;base64,/, "");
            if (!b64) {
              skipped += 1;
              continue;
            }
            const png = Buffer.from(b64, "base64");
            if (!png.length) {
              skipped += 1;
              continue;
            }
            const fingerprint = String(src.fingerprint || `img:${hashBuffer(png)}`);
            if (existingFp.has(fingerprint)) {
              skipped += 1;
              continue;
            }
            const id = uid();
            existingFp.add(fingerprint);
            rememberItem({
              id,
              kind: "image",
              text: "",
              imageFile: savePng(png, id),
              fingerprint,
              createdAt: Number(src.createdAt) || Date.now()
            });
            added += 1;
          } else {
            const text = String(src.text || "");
            if (!text.trim()) {
              skipped += 1;
              continue;
            }
            const fingerprint = String(src.fingerprint || `text:${text}`);
            if (existingFp.has(fingerprint)) {
              skipped += 1;
              continue;
            }
            existingFp.add(fingerprint);
            rememberItem({
              kind: "text",
              text,
              fingerprint,
              createdAt: Number(src.createdAt) || Date.now()
            });
            added += 1;
          }
        }
        sendClipboardHistory();
        return {
          ok: true,
          reason: "clipboard",
          added,
          skipped,
          history: historyViews(),
          snapshot: workspaceSnapshot()
        };
      });
      createWindow(initial.alwaysOnTop);
      startClipboardWatch();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow(readState().alwaysOnTop);
        }
      });
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  }
});

// run.ts
var import_cors = __toESM(require("cors"), 1);
var import_express = __toESM(require("express"), 1);
init_electron_shim();
var PORT = Number(process.env.PORT) || 3923;
async function main() {
  await Promise.resolve().then(() => (init_core(), core_exports));
  const app2 = (0, import_express.default)();
  app2.use((0, import_cors.default)());
  app2.use(import_express.default.json({ limit: "32mb" }));
  app2.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app2.post("/invoke", async (req, res) => {
    const channel = String(req.body?.channel || "");
    const args = Array.isArray(req.body?.args) ? req.body.args : [];
    const handler = getIpcHandlers().get(channel);
    if (!handler) {
      res.status(404).json({ error: `unknown channel: ${channel}` });
      return;
    }
    try {
      const result = await handler({}, ...args);
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  app2.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    const listener = (channel, payload) => {
      res.write(`event: ${channel}
`);
      res.write(`data: ${JSON.stringify(payload)}

`);
    };
    onRendererPush(listener);
    req.on("close", () => {
      res.end();
    });
  });
  app2.listen(PORT, "127.0.0.1", () => {
    console.log(`[stickers-api] listening on ${PORT}`);
  });
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
