package main

import (
	"os"
	"path/filepath"

	"github.com/example/doctor-appointment-rag/services/rag/internal/ingestion"
)

type doc struct {
	name       string
	title      string
	paragraphs []string
}

func main() {
	out := "docs/knowledge"
	if len(os.Args) > 1 {
		out = os.Args[1]
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		panic(err)
	}

	for _, item := range documents() {
		path := filepath.Join(out, item.name)
		file, err := os.Create(path)
		if err != nil {
			panic(err)
		}
		if err := ingestion.WritePlainPDF(file, item.title, item.paragraphs); err != nil {
			_ = file.Close()
			panic(err)
		}
		if err := file.Close(); err != nil {
			panic(err)
		}
	}
}

func documents() []doc {
	return []doc{
		{
			name:  "pregnancy-nutrition.pdf",
			title: "Pregnancy Nutrition Guide",
			paragraphs: []string{
				"A balanced diet during pregnancy supports the health of both the parent and the developing baby. This guide summarises widely published public-health nutrition advice. It is not a personal medical prescription.",
				"Folic acid is important before conception and in the first twelve weeks because it helps the neural tube close. Many health services recommend a daily folic acid supplement in addition to folate-rich foods such as leafy greens, beans, and fortified cereals.",
				"Iron needs rise in the second half of pregnancy. Iron-rich foods include lean red meat, beans, lentils, and dark green vegetables. Vitamin C from fruit or peppers helps the body absorb plant iron. Tea and coffee taken with meals can reduce absorption.",
				"Hydration matters. Most people feel better if they drink water regularly through the day rather than waiting until they are thirsty. Plain water, milk, and unsweetened drinks are preferred over sugary beverages.",
				"Foods commonly advised against include unpasteurised milk and cheese, raw or undercooked eggs and meat, liver in large amounts, and fish known to be high in mercury such as swordfish. Alcohol is not considered safe at any stage of pregnancy.",
				"This document does not contain medicine dosages. Questions about tablets, pain relief, or supplements other than standard folic acid and vitamin D should be directed to a clinician.",
			},
		},
		{
			name:  "prenatal-care.pdf",
			title: "Prenatal Care Overview",
			paragraphs: []string{
				"Prenatal care is the scheduled medical follow-up that runs from the first positive pregnancy test through birth. Regular visits let a clinician track growth, blood pressure, and the parent's wellbeing.",
				"A typical schedule in an uncomplicated pregnancy is a first visit in the first trimester, monthly visits until 28 weeks, fortnightly visits until 36 weeks, and weekly visits thereafter. Local services may differ.",
				"Warning signs that need same-day medical attention include vaginal bleeding, sudden severe headache, visual disturbance, severe abdominal pain, reduced fetal movements after 24 weeks, and a fever that does not settle.",
				"Each visit commonly includes blood pressure, urine testing for protein, measurement of the uterus, and a conversation about mood, sleep, and support at home. Blood tests may check anaemia, blood group, and immunity.",
				"This overview does not describe drug treatment or emergency procedures. It exists so patients know what routine care looks like and when to seek help.",
			},
		},
		{
			name:  "child-nutrition.pdf",
			title: "Child Nutrition Guide",
			paragraphs: []string{
				"Good nutrition in the first years of life supports growth, immunity, and later eating habits. This guide covers exclusive milk feeding, complementary foods, and everyday family meals.",
				"Exclusive breastfeeding is recommended for about the first six months when it is possible and wanted. Infant formula is an appropriate alternative when breastfeeding is not used. Cow's milk is not a main drink before twelve months.",
				"Complementary foods are usually introduced at around six months, when the infant can sit with support and shows interest in food. Start with soft mashed vegetables, fruit, and iron-rich foods such as meat, beans, or fortified cereal.",
				"Offer a variety of tastes and textures. There is no need to add salt or sugar. Honey should not be given to children under twelve months because of the risk of infant botulism.",
				"Older children do well on regular meals and snacks built from vegetables, fruit, whole grains, protein foods, and dairy or fortified alternatives. Sweet drinks are best kept for occasional use.",
				"This document does not discuss treatment of feeding disorders, allergies beyond a brief mention, or medication. Speak to a clinician if a child is losing weight, refusing all fluids, or has a suspected food allergy.",
			},
		},
	}
}
