// Proactive Speak Skill
// 主动发言实现

/**
 * 检查是否满足主动发言条件
 * @param {Object} context - 当前上下文
 * @returns {boolean} 是否应该发言
 */
function shouldSpeak(context) {
  const { triggers, currentTime, events } = context;

  for (const trigger of triggers) {
    if (trigger.type === 'schedule' && checkSchedule(trigger.cron, currentTime)) {
      return true;
    }
    if (trigger.type === 'event' && events.includes(trigger.event)) {
      return true;
    }
  }
  return false;
}

/**
 * 检查时间触发器
 */
function checkSchedule(cron, date) {
  // 简化的 cron 检查
  const [minute, hour, day, month, weekday] = cron.split(' ');

  const d = new Date(date);
  if (hour !== '*' && d.getHours() !== parseInt(hour)) return false;
  if (minute !== '*' && d.getMinutes() !== parseInt(minute)) return false;

  return true;
}

/**
 * 生成主动发言内容
 */
function generateMessage(context) {
  const { triggerType, data } = context;

  if (triggerType === 'schedule') {
    return "定时提醒：" + data?.message || "您好，是时候处理待办事项了！";
  }
  if (triggerType === 'event') {
    return "事件通知：" + data?.message || "发生了一个新事件！";
  }

  return "我有重要的事情要告诉您！";
}

module.exports = {
  shouldSpeak,
  checkSchedule,
  generateMessage
};
