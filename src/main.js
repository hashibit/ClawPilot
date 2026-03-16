// ClawPilot — 前端入口
// Tauri invoke 封装将在阶段 4 完整实现

const { invoke } = window.__TAURI__?.core ?? { invoke: async () => {} };

window.clawpilot = { invoke };
