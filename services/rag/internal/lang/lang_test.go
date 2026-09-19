package lang

import (
	"strings"
	"testing"
)

func TestLooksBengali(t *testing.T) {
	if !LooksBengali("গর্ভাবস্থায় কী খাব?") {
		t.Fatal("expected Bengali script")
	}
	if LooksBengali("What should I eat during pregnancy?") {
		t.Fatal("English should not look Bengali")
	}
}

func TestResolveSwitchSticksAcrossHistory(t *testing.T) {
	pref := Resolve("What should I eat during pregnancy?", []Turn{
		{Role: "user", Content: "Please switch to Bangla"},
		{Role: "assistant", Content: "ঠিক আছে, এখন থেকে বাংলায় উত্তর দেব।"},
	})
	if pref.Code != "bn" {
		t.Fatalf("expected bangla after switch, got %+v", pref)
	}
}

func TestCapabilityDoesNotLockLanguage(t *testing.T) {
	pref := Resolve("Can you speak bangla??", nil)
	if pref.Code == "bn" {
		t.Fatal("capability question asked in English should not lock Bangla")
	}
	if !IsLanguageTurn("Can you speak bangla??") {
		t.Fatal("capability should be a language-only turn")
	}
	if !IsLanguageTurn("Switch to bangla") {
		t.Fatal("switch should be a language-only turn")
	}
	if IsLanguageTurn("Switch to bangla. What should I eat during pregnancy?") {
		t.Fatal("switch plus a real question is not language-only")
	}
}

func TestResolveExplicitSwitch(t *testing.T) {
	pref := Resolve("Please reply in bangla", nil)
	if pref.Code != "bn" {
		t.Fatalf("got %+v", pref)
	}
}

func TestInsufficientAnswerLanguage(t *testing.T) {
	if InsufficientAnswer("hello") != InsufficientEN {
		t.Fatal("english fallback")
	}
	if InsufficientAnswer("গর্ভাবস্থায় কী খাব?") != InsufficientBN {
		t.Fatal("bangla fallback")
	}
}

func TestLooksBanglush(t *testing.T) {
	if !LooksBanglush("ami ki khabo pregnancy te") {
		t.Fatal("expected banglush")
	}
	if !LooksBanglush("bachchake koy maash theke solid deya shuru korbo?") {
		t.Fatal("expected infant-feeding banglish")
	}
	if !LooksBanglush("pregnant obesthay kon kon vitamin beshi joruri?") {
		t.Fatal("expected pregnancy vitamin banglish")
	}
	if LooksBanglush("What should I eat during pregnancy?") {
		t.Fatal("plain English is not banglush")
	}
	if LooksBanglush("গর্ভাবস্থায় কী খাব?") {
		t.Fatal("Bengali script is Bangla, not Banglush")
	}
}

func TestResolveBanglushSwitchSticks(t *testing.T) {
	pref := Resolve("What should I eat during pregnancy?", []Turn{
		{Role: "user", Content: "Reply in banglush"},
	})
	if pref.Code != "bl" || !strings.Contains(pref.Name, "Banglish") {
		t.Fatalf("expected banglish after switch, got %+v", pref)
	}
}

func TestBanglushCapabilityDoesNotLock(t *testing.T) {
	pref := Resolve("Can you speak banglush?", nil)
	if pref.Code == "bl" {
		t.Fatal("capability in English should not lock Banglush")
	}
	if !IsLanguageTurn("Can you speak banglush?") {
		t.Fatal("expected language-only turn")
	}
}

func TestBanglushNotConfusedWithBangla(t *testing.T) {
	pref := Resolve("Please switch to banglush", nil)
	if pref.Code != "bl" {
		t.Fatalf("banglush switch matched %+v", pref)
	}
}

func TestCrossLingualIgnoresEnglishSwitchPhrase(t *testing.T) {
	if CrossLingualQuestion("Switch to bangla. What paracetamol dosage is safe?") {
		t.Fatal("English question with a switch phrase is not cross-lingual")
	}
	if !CrossLingualQuestion("গর্ভাবস্থায় কী খাওয়া উচিত?") {
		t.Fatal("Bengali script is cross-lingual")
	}
	if !CrossLingualQuestion("pregnancy te ki khabo") {
		t.Fatal("Banglush is cross-lingual")
	}
}
