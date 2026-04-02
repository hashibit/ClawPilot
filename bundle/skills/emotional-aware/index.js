// Emotional Aware Skill
// 情绪感知实现

const EMOTION_KEYWORDS = {
  positive: ['高兴', '开心', '谢谢', '好', '棒', 'happy', 'great', 'thanks'],
  negative: ['生气', '失望', '差', '慢', 'wrong', 'bad', 'angry'],
  anxious: ['急', '快点', '赶紧', 'urgent', 'asap'],
  confused: ['为什么', '怎么', '不懂', '不明白', 'confused', 'dont understand']
};

/**
 * 分析文本情绪
 * @param {string} text - 输入文本
 * @returns {Object} 情绪分析结果
 */
function analyzeEmotion(text) {
  const lower = text.toLowerCase();
  const scores = {
    positive: 0,
    negative: 0,
    anxious: 0,
    confused: 0,
    neutral: 1
  };

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        scores[emotion] += 1;
        scores.neutral -= 0.2;
      }
    }
  }

  // 归一化
  const maxScore = Math.max(...Object.values(scores));
  const dominant = Object.entries(scores)
    .filter(([k]) => k !== 'neutral')
    .sort((a, b) => b[1] - a[1])[0];

  return {
    scores,
    dominant: dominant[0],
    intensity: Math.min(1, maxScore / 3),
    isNeutral: scores.neutral >= maxScore
  };
}

/**
 * 根据情绪调整回复风格
 */
function adaptStyle(emotion, baseResponse) {
  const prefixes = {
    positive: '很高兴能帮到您！',
    negative: '非常抱歉给您带来困扰，',
    anxious: '明白您很着急，我尽快帮您解决，',
    confused: '让我详细解释一下，',
    neutral: ''
  };

  return (prefixes[emotion] || '') + baseResponse;
}

/**
 * 生成共情回复
 */
function generateEmpathyResponse(emotion, intensity) {
  if (intensity < 0.3) return '';

  const responses = {
    positive: ['太好了！', '真为您高兴！', '这是个好消息！'],
    negative: ['我理解您的感受', '这确实令人沮丧', '我们一起解决这个问题'],
    anxious: ['别担心，我们会处理好的', '我明白时间紧迫', '优先处理您的需求'],
    confused: ['这是个很好的问题', '让我帮您理清楚', '不用担心，我来解释']
  };

  const options = responses[emotion] || [];
  return options[Math.floor(Math.random() * options.length)] || '';
}

module.exports = {
  analyzeEmotion,
  adaptStyle,
  generateEmpathyResponse
};
