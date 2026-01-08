import compoundDictData from "@public/compound_words.json"

export function getCompoundDict() {
  return compoundDictData.default || compoundDictData;
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
