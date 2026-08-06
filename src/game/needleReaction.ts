export type ReactionSeverity = 'NORMAL' | 'CAUTION' | 'ABNORMAL'

export type NeedleReactionCode =
  | 'DE_QI'
  | 'MILD_SORENESS'
  | 'SPOT_BLEEDING'
  | 'HEMATOMA'
  | 'TRANSIENT_ZAP'
  | 'PERSISTENT_NUMBNESS'
  | 'VASOVAGAL'
  | 'STUCK_NEEDLE'
  | 'SMALL_BRUISE'
  | 'BRUISE_SPREAD'
  | 'HARD_CONTACT'

export type NeedleReaction = {
  code: NeedleReactionCode
  icon: string
  title: string
  message: string
  patientLine: string
  classification: string
  severity: ReactionSeverity
  accent: string
  safety: string
}

type NeedleResult = 'SUCCESS' | 'BLOOD' | 'NERVE' | 'BRUISE' | 'BONE'

type ReactionContext = {
  result: NeedleResult
  stability: number
  vascularDifficulty: number
  treatmentStress: number
  seed: number
}

const REACTIONS: Record<NeedleReactionCode, NeedleReaction> = {
  DE_QI: {
    code: 'DE_QI',
    icon: '◎',
    title: '酸麻得气',
    message: '酸、胀、沉、重与短暂麻感交织，拔针后很快缓解。',
    patientLine: '这股酸麻感还挺明显，不过很快就过去了。',
    classification: '常见短暂反应',
    severity: 'NORMAL',
    accent: '#67edb0',
    safety: '游戏中的得气表现不等同于刺激神经，也不能用于判断真实疗效。',
  },
  MILD_SORENESS: {
    code: 'MILD_SORENESS',
    icon: '◌',
    title: '针点酸痛',
    message: '针点留下轻微酸痛感，患者忍不住轻轻甩了甩手。',
    patientLine: '这个点还有点酸，先别碰它。',
    classification: '常见短暂反应',
    severity: 'NORMAL',
    accent: '#f0b86d',
    safety: '现实中轻微针点不适可以短暂出现；持续加重则不属于普通反应。',
  },
  SPOT_BLEEDING: {
    code: 'SPOT_BLEEDING',
    icon: '●',
    title: '冒出血点',
    message: '拔针位置冒出少量血点，患者立刻盯住了你的手。',
    patientLine: '等等，怎么真的冒血了？',
    classification: '轻微不良反应',
    severity: 'CAUTION',
    accent: '#ff5d78',
    safety: '现实中的少量出血或瘀青可以发生；持续出血需要专业处理。',
  },
  HEMATOMA: {
    code: 'HEMATOMA',
    icon: '⬢',
    title: '血肿扩张',
    message: '局部迅速鼓起，青黑色瘀斑正向周围扩散。',
    patientLine: '这包怎么还在变大？我的手也越来越胀。',
    classification: '异常反应',
    severity: 'ABNORMAL',
    accent: '#d24272',
    safety: '现实中若肿胀或瘀斑持续扩大，或伴随明显疼痛、无力，应及时就医。',
  },
  TRANSIENT_ZAP: {
    code: 'TRANSIENT_ZAP',
    icon: 'ϟ',
    title: '短暂窜电',
    message: '一阵窜电感沿手指掠过，拔针后很快消退。',
    patientLine: '刚才那一下像电流窜过去了！',
    classification: '短暂刺激反应',
    severity: 'CAUTION',
    accent: '#77a7ff',
    safety: '窜电感不应被简单当作得气；现实操作中应停止继续刺激并观察。',
  },
  PERSISTENT_NUMBNESS: {
    code: 'PERSISTENT_NUMBNESS',
    icon: 'ϟ',
    title: '持续麻木',
    message: '针已拔出，电击痛、麻木与无力感却没有立刻消失。',
    patientLine: '针都拔了，怎么还是麻的？',
    classification: '异常反应',
    severity: 'ABNORMAL',
    accent: '#7890ff',
    safety: '现实中若持续麻木、电击痛、感觉减退或无力，应尽快接受医疗评估。',
  },
  VASOVAGAL: {
    code: 'VASOVAGAL',
    icon: '!',
    title: '突然晕针',
    message: '患者突然心慌、出冷汗、恶心发晕，画面开始失去颜色。',
    patientLine: '等一下，我有点恶心，眼前发黑……',
    classification: '异常反应',
    severity: 'ABNORMAL',
    accent: '#f1c66e',
    safety: '现实中出现晕厥或接近晕厥时，应立即停止操作并由专业人员处理。',
  },
  STUCK_NEEDLE: {
    code: 'STUCK_NEEDLE',
    icon: '↯',
    title: '针体滞住',
    message: '肌肉骤然紧张，针体像被锁住一样难以移动。',
    patientLine: '别硬拔！肌肉好像把针夹住了。',
    classification: '操作异常',
    severity: 'ABNORMAL',
    accent: '#ff9d63',
    safety: '现实中针体受阻或伴随剧痛时，不应强行提插或拔针，应交由专业人员处理。',
  },
  SMALL_BRUISE: {
    code: 'SMALL_BRUISE',
    icon: '◌',
    title: '局部瘀点',
    message: '针点周围出现一小片青紫，按压时有些发酸。',
    patientLine: '这里有一点青，碰着也有点酸。',
    classification: '轻微不良反应',
    severity: 'CAUTION',
    accent: '#9b78dc',
    safety: '现实中少量瘀青可以发生；若范围扩大或疼痛明显加重，应接受医疗评估。',
  },
  BRUISE_SPREAD: {
    code: 'BRUISE_SPREAD',
    icon: '◉',
    title: '大片青紫',
    message: '瘀斑颜色迅速加深，按压痛范围也在扩大。',
    patientLine: '这块紫得也太快了，按一下还疼。',
    classification: '异常反应',
    severity: 'ABNORMAL',
    accent: '#a878ff',
    safety: '现实中若瘀斑持续扩大、明显肿痛或影响活动，应及时接受医疗评估。',
  },
  HARD_CONTACT: {
    code: 'HARD_CONTACT',
    icon: '◆',
    title: '硬组织回弹',
    message: '针尖触到坚硬组织，伴随清脆撞击与明显回弹。',
    patientLine: '刚才是不是“叮”了一声？',
    classification: '操作异常',
    severity: 'ABNORMAL',
    accent: '#f4dfb5',
    safety: '现实中出现锐利或割裂样疼痛时，不应为了追求得气而继续刺激。',
  },
}

export function selectNeedleReaction({
  result,
  stability,
  vascularDifficulty,
  treatmentStress,
  seed,
}: ReactionContext): NeedleReaction {
  const normalizedSeed = Math.abs(seed) % 1

  if (
    result !== 'SUCCESS' &&
    treatmentStress >= 0.62 &&
    normalizedSeed > 0.82
  ) {
    return REACTIONS.VASOVAGAL
  }

  if (result === 'SUCCESS') {
    return normalizedSeed < 0.74
      ? REACTIONS.DE_QI
      : REACTIONS.MILD_SORENESS
  }

  if (result === 'BLOOD') {
    const hematomaThreshold = Math.min(
      0.46,
      0.2 + vascularDifficulty / 400 + treatmentStress * 0.08,
    )
    return normalizedSeed < hematomaThreshold
      ? REACTIONS.HEMATOMA
      : REACTIONS.SPOT_BLEEDING
  }

  if (result === 'NERVE') {
    return stability < 0.56 && normalizedSeed < 0.62
      ? REACTIONS.PERSISTENT_NUMBNESS
      : REACTIONS.TRANSIENT_ZAP
  }

  if (result === 'BRUISE') {
    return normalizedSeed < 0.7
      ? REACTIONS.BRUISE_SPREAD
      : REACTIONS.SMALL_BRUISE
  }

  return stability < 0.5 && normalizedSeed < 0.52
    ? REACTIONS.STUCK_NEEDLE
    : REACTIONS.HARD_CONTACT
}
