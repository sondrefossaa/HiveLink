import compoundDictData from "@public/compound_words.json"

export function getCompoundDict() {
  return compoundDictData.default || compoundDictData;
}

export function getWordsSet(): Set<string> {
  const compoundDict = getCompoundDict();
  const worsSet = new Set();
  compoundDict.forEach(item => {
    worsSet.add(item.word);
  });
  return worsSet;
}

// TODO: change so that tame word can have many entries, for ex duelist
export function getCompoundMap(): Map<string, { parts: { left: string; right: string }; wordFrequency: number; tier: number }> {
  const compoundMap = new Map<string, { parts: { left: string; right: string }; wordFrequency: number; tier: number }>();

  compoundDictData.forEach((entry: { word: string; parts: [string, string]; word_frequency: number; tier: number }) => {
    const [left, right] = entry.parts;
    compoundMap.set(entry.word, {
      parts: { left, right },
      wordFrequency: entry.word_frequency,
      tier: entry.tier
    });
  });

  return compoundMap;
}

export function getPartsSet() {
  const compoundDict = getCompoundDict();
  const partsSet = new Set();

  if (Array.isArray(compoundDict)) {
    compoundDict.forEach(item => {
      partsSet.add(item.parts);
    });
  }

  return partsSet;
}

export function getDiff1Set() {
  const compoundDict = getCompoundDict();
  const diff1Set = new Set(compoundDict.filter(word => word.tier == 1));
  return diff1Set;
}
