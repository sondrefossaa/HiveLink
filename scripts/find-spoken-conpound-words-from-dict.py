from wordfreq import word_frequency, zipf_frequency
import math
import json

compound_words = []
dict_path = "data/dictionary/words_alpha.txt"
sight_compound_path = "data/dictionary/sight-compounds.txt"
proofreadng_compound_path = "data/dictionary/proofreading-services-compounds.txt"
outfile = "public/spoken_compound.json"
min_freq=0.00001

proofreadng_compounds = open(proofreadng_compound_path, 'r')
sight_compounds = open(sight_compound_path, 'r')


def frequency_to_difficulty_5(zipf_score):
    """Map to 5 difficulty levels (1=easiest, 5=hardest)"""
    if zipf_score >= 5.0:      # Very common words
        return 1
    elif zipf_score >= 4.0:    # Common words
        return 2  
    elif zipf_score >= 3.0:    # Medium frequency
        return 3
    elif zipf_score >= 2.0:    # Uncommon words
        return 4
    else:                      # Rare/obscure words
        return 5

with open(dict_path, 'r', encoding="utf-8") as f:
    dict_words = {line.strip().lower() for line in f if line.strip()}
    validwords = {
            word for word in dict_words
            if zipf_frequency(word, 'en') > min_freq and len(word) > 2
            }
    dict_compound_words = {
            word
            for file in [proofreadng_compounds, sight_compounds]
            for line in file
            for word in line.strip().split('\t')
            if word and word.isalpha()
            }

    allwords = validwords.union(dict_compound_words)
    for word in allwords:
        if len(word) < 6:
            continue
        for i in range(1, len(word) -1):
            part1 = word[:i]
            part2 = word[i:]
            if part1 in validwords and part2 in validwords:
                zipF = zipf_frequency(word, 'en')
                
                zipF1 = zipf_frequency(part1, 'en')
                zipF2 = zipf_frequency(part2, 'en')

                compound_words.append({
                        "word": word,
                        "parts": [part1, part2],
                        "word_frequency": zipF,
                        "tier": frequency_to_difficulty_5((zipF1 + zipF2 + zipF*2) / 4)
                        })
                break

print(word_frequency("ft", "en"))

# print(compound_words
sight_compounds.close()
proofreadng_compounds.close()


with open(outfile, 'w') as f:
    json.dump(compound_words, f, indent=2)
