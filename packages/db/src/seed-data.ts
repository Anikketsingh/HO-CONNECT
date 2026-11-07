/**
 * Starting data. Everything here is editable in the dashboard afterwards.
 * Centres come from the theme's `snippets/asa-ec-locations.liquid` (16 ECs, Oct 2026).
 */

export const PARTNER_TYPES = [
  { slug: 'salon', name: 'Salon', description: 'Hair or unisex salon', sortOrder: 1 },
  { slug: 'parlour', name: 'Beauty parlour', description: 'Beauty parlour or studio', sortOrder: 2 },
  { slug: 'freelancer', name: 'Freelance stylist', description: 'Independent stylist or makeup artist', sortOrder: 3 },
  { slug: 'other', name: 'Other', description: 'Any other partner approved by HO', sortOrder: 4 },
] as const;

type DocSeed = { slug: string; name: string; description?: string; required: boolean; maxFiles?: number };

const PAN: DocSeed = { slug: 'pan', name: 'PAN card', description: 'Needed for TDS on commission', required: true };
const BANK: DocSeed = {
  slug: 'bank_proof',
  name: 'Bank proof',
  description: 'Cancelled cheque, passbook front page or bank statement',
  required: true,
};
const GST: DocSeed = { slug: 'gst', name: 'GST certificate', description: 'Only if GST-registered', required: false };

const BUSINESS_DOCS: DocSeed[] = [
  { slug: 'storefront_photo', name: 'Storefront photo', description: 'Outside, with the name board visible', required: true },
  { slug: 'interior_photo', name: 'Interior photo', required: true, maxFiles: 3 },
  PAN,
  BANK,
  {
    slug: 'business_proof',
    name: 'Business proof',
    description: 'Shop licence, Udyam certificate, trade licence or utility bill in the business name',
    required: false,
  },
  GST,
];

export const DOCUMENT_CHECKLISTS: Record<(typeof PARTNER_TYPES)[number]['slug'], DocSeed[]> = {
  salon: BUSINESS_DOCS,
  parlour: BUSINESS_DOCS,
  freelancer: [
    PAN,
    BANK,
    {
      slug: 'portfolio',
      name: 'Portfolio',
      description: 'Photos of your work, or a screenshot of your Instagram / business page',
      required: true,
      maxFiles: 3,
    },
    {
      slug: 'id_proof',
      name: 'ID proof',
      description: 'Driving licence, voter ID or passport (if Aadhaar, upload the masked version only)',
      required: true,
    },
    GST,
  ],
  other: [PAN, BANK, { slug: 'supporting_document', name: 'Supporting document', required: false, maxFiles: 3 }],
};

export const PRODUCT_CATEGORIES = [
  { slug: 'clip-in-extensions', name: 'Clip-in extensions' },
  { slug: 'volumisers-styling', name: 'Volumisers, ponytails & buns' },
  { slug: 'toppers-wigs', name: 'Hair toppers & wigs (women)' },
  { slug: 'mens-patch', name: "Men's hair patch" },
  { slug: 'permanent-extensions', name: 'Permanent hair extensions' },
  { slug: 'kids-range', name: 'Kids range' },
  { slug: 'accessories', name: 'Hair accessories' },
  { slug: 'tools-essentials', name: 'Tools & essentials' },
].map((c, i) => ({ ...c, sortOrder: i + 1 }));

export const CENTRES = [
  { slug: 'rajouri', name: 'Rajouri Garden', city: 'Delhi', region: 'Delhi NCR', address: 'Main Market, Rajouri Garden Marg, Delhi', pincode: '110027', phone: '9599299215', whatsapp: '9217660385' },
  { slug: 'gurgaon', name: 'Gurugram', city: 'Gurugram', region: 'Delhi NCR', address: 'Golf Course Rd, Sector 42, Gurugram', pincode: '122002', phone: '9289585882', whatsapp: '9217660385' },
  { slug: 'noida', name: 'Noida', city: 'Noida', region: 'Delhi NCR', address: 'Wave One Mall, Sector 18, Noida', pincode: null, phone: '9217845417', whatsapp: '7428121414' },
  { slug: 'preet-vihar', name: 'Preet Vihar', city: 'Delhi', region: 'Delhi NCR', address: 'Vikas Marg, Shankar Vihar, Delhi', pincode: '110092', phone: '9266070696', whatsapp: '9217660385' },
  { slug: 'andheri', name: 'Andheri', city: 'Mumbai', region: 'Mumbai', address: 'Andheri Link Rd, D.N. Nagar, Mumbai', pincode: '400053', phone: '9910566091', whatsapp: '9217660385' },
  { slug: 'chembur', name: 'Chembur', city: 'Mumbai', region: 'Mumbai', address: 'Tilak Nagar, Mumbai', pincode: '400089', phone: '9599299218', whatsapp: '9599299218' },
  { slug: 'hyderabad', name: 'Gachibowli', city: 'Hyderabad', region: 'Hyderabad', address: 'Bio Diversity, Rai Durg, Hyderabad', pincode: '500032', phone: '9289300618', whatsapp: '9289300618' },
  { slug: 'jayanagar', name: 'Jayanagar', city: 'Bengaluru', region: 'Bengaluru', address: '10th Main Rd, 4th T Block, Bengaluru', pincode: '560041', phone: '9724156704', whatsapp: '9217660385' },
  { slug: 'hsr-layout', name: 'HSR Layout', city: 'Bengaluru', region: 'Bengaluru', address: '27th Main, Sector 1, Bengaluru', pincode: '560102', phone: '9266070695', whatsapp: '9217660385' },
  { slug: 'koramangala', name: 'Koramangala', city: 'Bengaluru', region: 'Bengaluru', address: '6th Block, Koramangala, Bengaluru', pincode: '560095', phone: '9266070693', whatsapp: '9217660385' },
  { slug: 'lucknow', name: 'Lucknow', city: 'Lucknow', region: 'Lucknow', address: 'Shalimar Eldee Plaza, Faizabad Rd, Lucknow', pincode: '226016', phone: '8448638666', whatsapp: '7428121414' },
  { slug: 'chandigarh', name: 'New Chandigarh', city: 'New Chandigarh', region: 'Chandigarh', address: 'Eco City 1, Mullanpur', pincode: '140901', phone: '8448638666', whatsapp: '7428121414' },
  { slug: 'jaipur', name: 'Jaipur', city: 'Jaipur', region: 'Jaipur', address: 'Raja Park, Panchwati Circle, Jaipur', pincode: '302004', phone: '8448638666', whatsapp: '7428121414' },
  { slug: 'ahmedabad', name: 'Ahmedabad', city: 'Ahmedabad', region: 'Ahmedabad', address: 'Atlanta Tower, C.G. Road, Ahmedabad', pincode: '380006', phone: '8796401775', whatsapp: '7428121414' },
  { slug: 'kolkata', name: 'Kolkata', city: 'Kolkata', region: 'Kolkata', address: 'City Centre 2, Rajarhat, Kolkata', pincode: '700161', phone: '7042600563', whatsapp: '7042600563' },
  { slug: 'agra', name: 'Agra', city: 'Agra', region: 'Agra', address: 'Fatehabad Rd, Tajganj, Agra', pincode: '282001', phone: '7428281179', whatsapp: '7428121414' },
].map((c, i) => ({ ...c, sortOrder: i + 1 }));

export const LEGAL_DOCUMENTS = [
  {
    kind: 'partner_terms' as const,
    version: '0.1-draft',
    title: 'HO Connect Partner Terms (DRAFT)',
    body:
      'DRAFT – replace with legally reviewed terms before launch.\n\n' +
      'Covers: eligibility, how leads are credited, ownership window, commission calculation, ' +
      'hold period and reversals, payouts and TDS, customer data handling, prohibited conduct, termination.',
  },
  {
    kind: 'customer_consent' as const,
    version: '0.1-draft',
    title: 'Customer consent (DRAFT)',
    body:
      'DRAFT – replace with legally reviewed text before launch.\n\n' +
      'I agree that {{partner_name}} may share my name and phone number with HairOriginals ' +
      '(Krisoriginals Private Limited) so that HairOriginals can contact me about hair solutions ' +
      'by call, SMS or WhatsApp. I can withdraw this consent at any time.',
  },
];

export const MESSAGE_TEMPLATES = [
  {
    key: 'consent_otp',
    channel: 'sms' as const,
    body: '{{otp}} is your OTP to confirm your referral to HairOriginals by {{partner_name}}. Valid for {{hours}} hours. - HairOriginals',
  },
  {
    key: 'customer_welcome',
    channel: 'whatsapp' as const,
    body: 'Hi {{customer_name}}, {{partner_name}} has referred you to HairOriginals. Our hair expert will call you shortly. {{benefit_text}}',
  },
  {
    key: 'customer_nudge',
    channel: 'whatsapp' as const,
    body: 'Hi {{customer_name}}, we tried to reach you about your HairOriginals consultation (referred by {{partner_name}}). Reply here or call {{callback_number}} at a time that suits you.',
  },
];
