import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type HomeSectionId =
  | 'hero'
  | 'categories'
  | 'benefits'
  | 'products'
  | 'testimonials'
  | 'newsletter'

type HeroSlideConfig = {
  title: string
  highlight: string
  titleEnd: string
  description: string
  image: string
  cta: string
  link: string
}

type BenefitConfig = {
  title: string
  description: string
}

type TestimonialConfig = {
  name: string
  comment: string
  stars: number
}

interface ConfigState {
  whatsappNumber: string
  setWhatsappNumber: (number: string) => void
  homeSectionsOrder: HomeSectionId[]
  setHomeSectionsOrder: (order: HomeSectionId[]) => void
  heroSlides: HeroSlideConfig[]
  setHeroSlides: (slides: HeroSlideConfig[]) => void
  benefits: BenefitConfig[]
  setBenefits: (benefits: BenefitConfig[]) => void
  testimonials: TestimonialConfig[]
  setTestimonials: (testimonials: TestimonialConfig[]) => void
  categoryTitle: string
  categorySubtitle: string
  setCategoryTitle: (value: string) => void
  setCategorySubtitle: (value: string) => void
  testimonialsTitle: string
  testimonialsSubtitle: string
  setTestimonialsTitle: (value: string) => void
  setTestimonialsSubtitle: (value: string) => void
  newsletterTitle: string
  newsletterSubtitle: string
  newsletterCta: string
  newsletterDisclaimer: string
  setNewsletterTitle: (value: string) => void
  setNewsletterSubtitle: (value: string) => void
  setNewsletterCta: (value: string) => void
  setNewsletterDisclaimer: (value: string) => void
  footerDescription: string
  contactEmail: string
  setFooterDescription: (value: string) => void
  setContactEmail: (value: string) => void
  agentName: string
  agentSubtitle: string
  agentAvatarUrl: string
  agentWelcomeMessage: string
  agentInputPlaceholder: string
  agentSource: string
  setAgentName: (value: string) => void
  setAgentSubtitle: (value: string) => void
  setAgentAvatarUrl: (value: string) => void
  setAgentWelcomeMessage: (value: string) => void
  setAgentInputPlaceholder: (value: string) => void
  setAgentSource: (value: string) => void
  shippingFee: number
  setShippingFee: (value: number) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      whatsappNumber: '5511999999999',
      setWhatsappNumber: (number) => set({ whatsappNumber: number }),
      homeSectionsOrder: [
        'hero',
        'categories',
        'benefits',
        'products',
        'testimonials',
        'newsletter',
      ],
      setHomeSectionsOrder: (order) => set({ homeSectionsOrder: order }),
      heroSlides: [
        {
          title: 'Doces que transformam ',
          highlight: 'momentos',
          titleEnd: ' em memória.',
          description:
            'Experimente o sabor inesquecível de nossos bolos e doces feitos com ingredientes selecionados, técnica refinada e muito amor.',
          image:
            'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=80',
          cta: 'Ver cardápio',
          link: '#menu',
        },
        {
          title: 'Bolos artísticos para ',
          highlight: 'celebrar',
          titleEnd: ' a vida.',
          description:
            'Cada detalhe é pensado para tornar sua festa única. Personalização exclusiva para casamentos, aniversários e eventos.',
          image:
            'https://images.unsplash.com/photo-1535254973040-607b474cb50d?auto=format&fit=crop&w=1200&q=80',
          cta: 'Fazer encomenda',
          link: 'whatsapp',
        },
        {
          title: 'O verdadeiro sabor da ',
          highlight: 'felicidade',
          titleEnd: '.',
          description:
            'Doces finos, sobremesas gourmet e chocolates artesanais que derretem na boca e aquecem o coração.',
          image:
            'https://images.unsplash.com/photo-1488477181946-6428a029177b?auto=format&fit=crop&w=1200&q=80',
          cta: 'Conhecer produtos',
          link: '#features',
        },
      ],
      setHeroSlides: (slides) => set({ heroSlides: slides }),
      benefits: [
        {
          title: 'Ingredientes Selecionados',
          description: 'Utilizamos apenas ingredientes frescos e de alta qualidade.',
        },
        {
          title: 'Produção Artesanal',
          description: 'Cada doce é feito à mão com carinho e dedicação.',
        },
        {
          title: 'Entrega Rápida',
          description: 'Receba seus doces fresquinhos no conforto da sua casa.',
        },
        {
          title: 'Personalização',
          description: 'Kits e bolos personalizados para tornar seu evento único.',
        },
      ],
      setBenefits: (benefits) => set({ benefits }),
      testimonials: [
        {
          name: 'Mariana Souza',
          comment:
            'O bolo Red Velvet mais delicioso que já comi! A apresentação é impecável.',
          stars: 5,
        },
        {
          name: 'Carlos Eduardo',
          comment:
            'Encomendei os doces para o aniversário da minha filha e foi um sucesso total.',
          stars: 5,
        },
        {
          name: 'Fernanda Lima',
          comment:
            'Atendimento excelente e entrega super pontual. Recomendo muito!',
          stars: 5,
        },
      ],
      setTestimonials: (testimonials) => set({ testimonials }),
      categoryTitle: 'Nossas Especialidades',
      categorySubtitle:
        'Descubra o que fazemos de melhor, com ingredientes selecionados e muito carinho',
      setCategoryTitle: (value) => set({ categoryTitle: value }),
      setCategorySubtitle: (value) => set({ categorySubtitle: value }),
      testimonialsTitle: 'O que dizem nossos clientes',
      testimonialsSubtitle: 'Momentos doces compartilhados por quem já experimentou',
      setTestimonialsTitle: (value) => set({ testimonialsTitle: value }),
      setTestimonialsSubtitle: (value) => set({ testimonialsSubtitle: value }),
      newsletterTitle: 'Receba um doce presente',
      newsletterSubtitle:
        'Cadastre-se na nossa newsletter e ganhe 10% de desconto na sua primeira encomenda, além de novidades deliciosas.',
      newsletterCta: 'Quero meu desconto',
      newsletterDisclaimer: 'Não se preocupe, não enviamos spam. Apenas doçuras.',
      setNewsletterTitle: (value) => set({ newsletterTitle: value }),
      setNewsletterSubtitle: (value) => set({ newsletterSubtitle: value }),
      setNewsletterCta: (value) => set({ newsletterCta: value }),
      setNewsletterDisclaimer: (value) => set({ newsletterDisclaimer: value }),
      footerDescription:
        'Transformando açúcar e afeto em momentos inesquecíveis. A excelência da confeitaria artesanal em cada detalhe.',
      contactEmail: 'contato@jallu.com.br',
      setFooterDescription: (value) => set({ footerDescription: value }),
      setContactEmail: (value) => set({ contactEmail: value }),
      agentName: 'Cupcake',
      agentSubtitle: 'Assistente virtual Jallu',
      agentAvatarUrl: '/cupcake-avatar.png',
      agentWelcomeMessage:
        'Olá! Posso ajudar com pedidos, status de encomendas e dúvidas sobre os produtos.',
      agentInputPlaceholder: 'Escreva sua mensagem...',
      agentSource: 'jallu-ecommerce',
      shippingFee: 10,
      setShippingFee: (value: number) => set({ shippingFee: value }),
      setAgentName: (value) => set({ agentName: value }),
      setAgentSubtitle: (value) => set({ agentSubtitle: value }),
      setAgentAvatarUrl: (value) => set({ agentAvatarUrl: value }),
      setAgentWelcomeMessage: (value) => set({ agentWelcomeMessage: value }),
      setAgentInputPlaceholder: (value) => set({ agentInputPlaceholder: value }),
      setAgentSource: (value) => set({ agentSource: value }),
    }),
    {
      name: 'config-storage',
    }
  )
)
