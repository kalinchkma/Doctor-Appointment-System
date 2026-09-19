package lang

import "testing"

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

func TestCrossLingualIgnoresEnglishSwitchPhrase(t *testing.T) {
	if CrossLingualQuestion("Switch to bangla. What paracetamol dosage is safe?") {
		t.Fatal("English question with a switch phrase is not cross-lingual")
	}
	if !CrossLingualQuestion("গর্ভাবস্থায় কী খাওয়া উচিত?") {
		t.Fatal("Bengali script is cross-lingual")
	}
}
