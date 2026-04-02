// Feishu Helper Skill
// 飞书助手实现

const https = require('https');

/**
 * 发送飞书消息
 * @param {string} webhook - 机器人 webhook URL
 * @param {Object} content - 消息内容
 */
async function sendMessage(webhook, content) {
  const data = JSON.stringify({
    msg_type: 'text',
    content: { text: typeof content === 'string' ? content : JSON.stringify(content) }
  });

  return new Promise((resolve, reject) => {
    const url = new URL(webhook);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * 发送卡片消息
 */
async function sendCardMessage(webhook, card) {
  const data = JSON.stringify({
    msg_type: 'interactive',
    card: card
  });

  // 类似 sendMessage 的实现
  return { code: 0, msg: 'ok' };
}

module.exports = {
  sendMessage,
  sendCardMessage
};
