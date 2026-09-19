package lang

import (
	"regexp"
	"strings"
	"unicode"
)

// Preference is the language the assistant should write in. It follows the
// current turn, an explicit switch ("reply in Bangla"), or earlier user turns.
type Preference struct {
	Code string // en, bn, bl, or empty to follow the latest user message
	Name string
}

var (
	English  = Preference{Code: "en", Name: "English"}
	Bengali  = Preference{Code: "bn", Name: "Bengali (Bangla)"}
	Banglush = Preference{Code: "bl", Name: "Banglish (Bangla in English letters)"}
	Follow   = Preference{Code: "", Name: "the same language as the user"}
)

type languageSpec struct {
	pref Preference
	keys []string
}

// Banglush keys must be listed before "bangla" so "banglush" is not matched as Bangla.
var languages = []languageSpec{
	{Banglush, []string{"banglush", "banglish", "banglish e", "banglush e"}},
	{Bengali, []string{"bangla", "bengali", "বাংলা"}},
	{English, []string{"english", "ইংরেজি", "ইংলিশ"}},
}

var (
	switchRe     = regexp.MustCompile(`(?i)\b((?:please\s+)?(?:switch|change|talk|speak|reply|answer|respond|write|continue|use)(?:\s+\w+){0,4}\s+(?:to|in|using)?\s*)`)
	capabilityRe = regexp.MustCompile(`(?i)\b(can you|could you|do you|are you able to|will you)\b`)
	langWordRe   = regexp.MustCompile(`(?i)\b(banglush|banglish|bangla|bengali|english|বাংলা|ইংরেজি|ইংলিশ)\b`)
)

// Distinctive romanized Bangla tokens used in Banglush chat (Latin letters only).
var banglushStrong = map[string]struct{}{
	"ami": {}, "tumi": {}, "apni": {}, "apnar": {}, "amar": {}, "tomar": {},
	"kemon": {}, "kothay": {}, "kokhon": {}, "koto": {}, "keno": {},
	"acho": {}, "achen": {}, "achi": {},
	"khabo": {}, "khawa": {}, "khaowa": {}, "khaben": {}, "khao": {},
	"parbo": {}, "parben": {}, "paro": {}, "paren": {},
	"dorkar": {}, "dhonnobad": {}, "shukria": {},
	"gorbha": {}, "gorbhabostha": {}, "oshud": {}, "daktar": {},
	"bhalo": {}, "valo": {}, "thikase": {},
	"jonno": {}, "lagbe": {}, "hobe": {}, "korbo": {}, "korben": {},
	"bolbo": {}, "bolben": {}, "khobor": {},
}

var banglushLight = map[string]struct{}{
	"ki": {}, "nai": {}, "nei": {}, "bolo": {}, "bolen": {}, "thik": {},
	"acha": {}, "accha": {}, "bhai": {}, "apa": {},
}

// LooksBengali reports whether the text is written in Bengali script.
func LooksBengali(s string) bool {
	bengali, letters := 0, 0
	for _, r := range s {
		if r >= 0x0980 && r <= 0x09FF {
			bengali++
		}
		if unicode.IsLetter(r) {
			letters++
		}
	}
	if bengali >= 2 {
		return true
	}
	return letters > 0 && bengali >= 1 && float64(bengali)/float64(letters) >= 0.3
}

// LooksBanglush reports Bangla written in English/Latin letters (Banglish).
func LooksBanglush(s string) bool {
	if LooksBengali(s) {
		return false
	}
	strong, light, post := 0, 0, 0
	for _, raw := range strings.Fields(strings.ToLower(s)) {
		word := strings.Trim(raw, "?.!,;:'\"()")
		if word == "" {
			continue
		}
		if _, ok := banglushStrong[word]; ok {
			strong++
			continue
		}
		if _, ok := banglushLight[word]; ok {
			light++
			continue
		}
		if strings.HasSuffix(word, "te") && len(word) > 3 {
			post++
		}
	}
	if strong >= 2 {
		return true
	}
	if strong >= 1 && (light >= 1 || post >= 1) {
		return true
	}
	return strong+light >= 3
}

// WantsBengali is true when this turn itself is Bangla or asks for Bangla.
func WantsBengali(s string) bool {
	return Resolve(s, nil).Code == "bn"
}

// CrossLingualQuestion is true when the actual question is Bengali script or
// Banglush. Used to relax English lexical coverage against English PDFs.
func CrossLingualQuestion(s string) bool {
	rest := StripLanguageDirectives(s)
	return LooksBengali(rest) || LooksBanglush(rest)
}

type Turn struct {
	Role    string
	Content string
}

// Resolve picks the reply language from this turn and earlier user messages.
func Resolve(question string, history []Turn) Preference {
	if pref, ok := explicitSwitch(question); ok {
		return pref
	}
	if LooksBengali(question) {
		return Bengali
	}
	if LooksBanglush(question) {
		return Banglush
	}
	for i := len(history) - 1; i >= 0; i-- {
		if !strings.EqualFold(strings.TrimSpace(history[i].Role), "user") {
			continue
		}
		text := history[i].Content
		if pref, ok := explicitSwitch(text); ok {
			return pref
		}
		if LooksBengali(text) {
			return Bengali
		}
		if LooksBanglush(text) {
			return Banglush
		}
	}
	return Follow
}

// IsLanguageTurn is a capability or switch request with no other question.
func IsLanguageTurn(s string) bool {
	if explicitLanguage(s) == nil && !LooksLikeCapability(s) {
		return false
	}
	rest := strings.TrimSpace(StripLanguageDirectives(s))
	rest = strings.Trim(rest, "?.!,;:।")
	if rest == "" {
		return true
	}
	switch strings.ToLower(rest) {
	case "please", "now", "from now on", "from now", "ok", "okay", "pls":
		return true
	default:
		return false
	}
}

// LooksLikeCapability is "can you speak / do you know" a language.
func LooksLikeCapability(s string) bool {
	q := strings.ToLower(strings.TrimSpace(s))
	if !langWordRe.MatchString(q) {
		return false
	}
	if capabilityRe.MatchString(q) {
		return true
	}
	return strings.Contains(q, "speak") && (strings.Contains(q, "?") || strings.Contains(q, "can"))
}

func explicitSwitch(s string) (Preference, bool) {
	q := strings.ToLower(s)
	if LooksLikeCapability(s) && !switchRe.MatchString(q) &&
		!strings.Contains(q, "switch") && !strings.Contains(q, "from now") &&
		!strings.Contains(q, "talk in") && !strings.Contains(q, "reply in") &&
		!strings.Contains(q, "answer in") && !strings.Contains(q, "respond in") {
		return Preference{}, false
	}
	if pref := explicitLanguage(s); pref != nil {
		if strings.Contains(q, "switch") || strings.Contains(q, "from now") ||
			strings.Contains(q, "talk in") || strings.Contains(q, "speak in") ||
			strings.Contains(q, "reply in") || strings.Contains(q, "answer in") ||
			strings.Contains(q, "respond in") || strings.Contains(q, "talk to me") ||
			strings.Contains(q, "use bangla") || strings.Contains(q, "use bengali") ||
			strings.Contains(q, "use banglush") || strings.Contains(q, "use banglish") ||
			strings.Contains(q, "use english") || strings.Contains(q, "বাংলায়") ||
			strings.Contains(q, "বাংলায়") || strings.Contains(q, "ইংরেজিতে") {
			return *pref, true
		}
	}
	return Preference{}, false
}

func explicitLanguage(s string) *Preference {
	lower := strings.ToLower(s)
	for _, spec := range languages {
		for _, key := range spec.keys {
			if strings.Contains(lower, strings.ToLower(key)) {
				p := spec.pref
				return &p
			}
		}
	}
	return nil
}

// StripLanguageDirectives removes switch/capability phrases so leftover text
// can be treated as the real question.
func StripLanguageDirectives(s string) string {
	out := s
	for _, spec := range languages {
		for _, key := range spec.keys {
			out = strings.ReplaceAll(strings.ToLower(out), strings.ToLower(key), " ")
		}
	}
	replacements := []string{
		"can you speak", "could you speak", "do you speak", "do you know",
		"can you talk", "can you write", "can you reply", "can you understand",
		"are you able to speak", "will you speak",
		"switch to", "change to", "talk in", "speak in", "reply in", "answer in",
		"respond in", "write in", "talk to me in", "from now on", "from now",
		"please", "in bangla", "in bengali", "in banglush", "in banglish", "in english",
		"বাংলায় কথা বলতে পারো", "বাংলায় কথা বলো", "বাংলা পারো", "বাংলা জানো",
	}
	lower := strings.ToLower(out)
	for _, phrase := range replacements {
		if i := strings.Index(lower, phrase); i >= 0 {
			out = out[:i] + " " + out[i+len(phrase):]
			lower = strings.ToLower(out)
		}
	}
	return strings.Join(strings.Fields(out), " ")
}

func ReplyInstruction(pref Preference) string {
	switch pref.Code {
	case "bl":
		return "Reply language: Banglish — Bangla written in English/Latin letters (romanized Bengali), not Bengali script. Example: \"Gorbhabosthay folate ar iron dorkar. Extra dujoner moto khete hobe na.\" Keep every sentence in romanized Bangla until the user switches. English medical terms are fine when there is no usual Bangla word. Context passages may be English — translate those facts; do not add new ones."
	case "bn":
		return "Reply language: Bengali (Bangla). Write every user-facing sentence in Bengali script until the user switches. Context passages may be in another language — translate those facts; do not add new ones."
	case "en":
		return "Reply language: English. Write every user-facing sentence in English until the user switches. Context passages may be in another language — translate those facts; do not add new ones."
	default:
		return "Reply language: the same language as the user (English, Bengali script, or Banglish — Bangla in English letters). Context passages may be in another language — translate those facts; do not add new ones."
	}
}

const (
	InsufficientEN = "I don't have enough information in the uploaded knowledge documents to answer that question. The question has been submitted for review."
	InsufficientBN = "আপলোড করা জ্ঞানভিত্তিক নথিতে এই প্রশ্নের উত্তর দেওয়ার মতো যথেষ্ট তথ্য নেই। প্রশ্নটি পর্যালোচনার জন্য জমা দেওয়া হয়েছে।"
	InsufficientBL = "Uploaded knowledge docs e ei question er jonno enough info nai. Review er jonno submit kora hoise."
	GreetingEN     = "Hello! I'm your clinic knowledge assistant. Ask me about topics covered in our uploaded healthcare documents and I will answer from those sources."
	GreetingBN     = "হ্যালো! আমি আপনার ক্লিনিকের জ্ঞান সহায়ক। আপলোড করা স্বাস্থ্য নথি থেকে প্রশ্ন করুন — উত্তর সেই নথি থেকেই দেব।"
	GreetingBL     = "Hello! Ami clinic er knowledge assistant. Uploaded health docs theke jiggesh koro — answer oikhane theke dibo."
	IdentityEN     = "I'm a knowledge-base assistant for this clinic app. I answer from documents the clinic uploaded — I don't diagnose or prescribe. For personal medical advice, please speak with a clinician."
	IdentityBN     = "আমি এই ক্লিনিক অ্যাপের জ্ঞানভিত্তিক সহায়ক। ক্লিনিক যে নথি আপলোড করেছে, সেগুলো থেকেই উত্তর দিই — রোগ নির্ণয় বা ওষুধ নির্ধারণ করি না। ব্যক্তিগত চিকিৎসা পরামর্শের জন্য একজন চিকিৎসকের সাথে কথা বলুন।"
	IdentityBL     = "Ami ei clinic app er knowledge assistant. Clinic je docs upload korche, oigula thekei answer dei — diagnose ba oshud suggest kori na. Nijer chikitsha advice er jonno doctor er sathe kotha bolo."
	OffTopicEN     = "I can only help with questions that relate to the clinic's uploaded knowledge documents. Try asking about those topics, or upload more documents in Admin if you need broader coverage."
	OffTopicBN     = "আমি শুধু ক্লিনিকের আপলোড করা জ্ঞান নথি সম্পর্কিত প্রশ্নে সাহায্য করতে পারি। সেই বিষয়ে জিজ্ঞাসা করুন, অথবা আরও নথি অ্যাডমিন থেকে আপলোড করুন।"
	OffTopicBL     = "Ami shudhu clinic er uploaded knowledge docs related question e help korte pari. Shei topic e jiggesh koro, ba Admin theke aro docs upload koro."
)

func pick(pref Preference, en, bn, bl string) string {
	switch pref.Code {
	case "bn":
		return bn
	case "bl":
		return bl
	default:
		return en
	}
}

func InsufficientFor(pref Preference) string {
	return pick(pref, InsufficientEN, InsufficientBN, InsufficientBL)
}
func GreetingFor(pref Preference) string { return pick(pref, GreetingEN, GreetingBN, GreetingBL) }
func IdentityFor(pref Preference) string { return pick(pref, IdentityEN, IdentityBN, IdentityBL) }
func OffTopicFor(pref Preference) string { return pick(pref, OffTopicEN, OffTopicBN, OffTopicBL) }

func InsufficientAnswer(question string) string {
	return InsufficientFor(Resolve(question, nil))
}

func GreetingAnswer(question string) string {
	return GreetingFor(Resolve(question, nil))
}

func IdentityAnswer(question string) string {
	return IdentityFor(Resolve(question, nil))
}

func OffTopicAnswer(question string) string {
	return OffTopicFor(Resolve(question, nil))
}
