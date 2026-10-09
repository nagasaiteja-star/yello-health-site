// Form definitions. One schema drives the screen, the validation and the printout.
const YN = ['Yes', 'No'];
const yn = (id, label, extra = {}) => ({ id, label, type: 'radio', options: YN, ...extra });
const text = (id, label, extra = {}) => ({ id, label, type: 'text', ...extra });

const patient = {
  title: 'Patient details',
  fields: [
    { id: 'p_title', label: 'Title', type: 'radio', options: ['Mr.', 'Ms.', 'Mrs.', 'Master'], required: true },
    text('p_name', 'Full name', { required: true, maxLen: 120, hint: 'As on the ID. Block letters are not needed here.' }),
    { id: 'p_dob', label: 'Date of birth', type: 'date', noFuture: true },
    { id: 'p_age', label: 'Age (years)', type: 'number', min: 0, max: 120 },
    { id: 'p_sex', label: 'Sex', type: 'radio', options: ['Male', 'Female', 'Transgender'], required: true },
    { id: 'p_address', label: 'Address', type: 'textarea', maxLen: 400 },
    text('p_state', 'State'),
    { id: 'p_pin', label: 'Pincode', type: 'pincode' },
    { id: 'p_phone', label: 'Patient phone', type: 'tel', required: true },
    { id: 'p_email', label: 'Patient email', type: 'email' },
  ],
};
const clinician = {
  title: 'Referring clinician',
  fields: [
    text('c_doctor', 'Doctor', { required: true, maxLen: 120 }),
    text('c_hospital', 'Hospital / lab', { maxLen: 160 }),
    { id: 'c_phone', label: 'Doctor phone', type: 'tel' },
    { id: 'c_email', label: 'Doctor email', type: 'email' },
  ],
};
const declaration = {
  title: 'Sample and declaration',
  fields: [
    text('s_collector', 'Sample collected by (name)', { required: true, maxLen: 120 }),
    { id: 'ok_consent', label: 'The patient (or guardian) has been told about this test and agrees to the sample being tested and to their health information being processed for it.', type: 'bool', required: true },
  ],
};
const patientRules = [{ type: 'oneOf', ids: ['p_dob', 'p_age'], errorOn: 'p_age', message: 'Enter date of birth or age' }];

export const FORMS = {
  coagulation: {
    id: 'coagulation', title: 'Coagulation', docNo: 'YLO/TRF/COAG/00',
    blurb: 'PT / APTT and factor assays',
    sections: [
      patient, clinician,
      {
        title: 'Tests',
        fields: [
          { id: 't_tests', label: 'Tests requested', type: 'tests', required: true, hint: 'Search the Yello directory by name or code.' },
          { id: 't_status', label: 'Sample status', type: 'radio', options: ['Fasting', 'Non-fasting'], required: true },
          text('t_physician', 'Physician', { maxLen: 120 }),
          { id: 't_collected', label: 'Specimen collection time', type: 'datetime', required: true, noFuture: true },
        ],
      },
      {
        title: 'Clinical history',
        fields: [
          yn('h_bleed_c', 'Bleeding disorder · congenital', { required: true }),
          yn('h_bleed_a', 'Bleeding disorder · acquired', { required: true }),
          yn('h_thromb_c', 'Thrombotic disorder · congenital', { required: true }),
          yn('h_thromb_a', 'Thrombotic disorder · acquired', { required: true }),
          yn('h_transf', 'Blood or blood-product transfusion', { required: true }),
          text('h_transf_when', 'When', { required: true, showIf: { id: 'h_transf', eq: 'Yes' } }),
          yn('h_surgery', 'Major surgery in the last year (cardiac, neurosurgery etc.)', { required: true }),
          text('h_surgery_d', 'Surgery details', { required: true, showIf: { id: 'h_surgery', eq: 'Yes' } }),
          text('h_diag', 'Probable diagnosis', { maxLen: 300 }),
        ],
      },
      {
        title: 'Previous investigations',
        fields: [
          yn('l_pt', 'Prothrombin time (PT / INR) done before', { required: true }),
          { id: 'l_pt_date', label: 'PT date', type: 'date', noFuture: true, showIf: { id: 'l_pt', eq: 'Yes' } },
          text('l_pt_inr', 'Last INR value', { showIf: { id: 'l_pt', eq: 'Yes' } }),
          yn('l_aptt', 'APTT done before', { required: true }),
          { id: 'l_aptt_date', label: 'APTT date', type: 'date', noFuture: true, showIf: { id: 'l_aptt', eq: 'Yes' } },
          text('l_aptt_val', 'Last APTT value', { showIf: { id: 'l_aptt', eq: 'Yes' } }),
          yn('l_lft', 'Liver function test done', { required: true }),
          { id: 'l_lft_date', label: 'LFT date', type: 'date', noFuture: true, showIf: { id: 'l_lft', eq: 'Yes' } },
          { id: 'l_lft_res', label: 'LFT result', type: 'radio', options: ['Normal', 'Abnormal'], showIf: { id: 'l_lft', eq: 'Yes' } },
        ],
      },
      {
        title: 'Medication affecting coagulation',
        fields: [
          ...[['warfarin', 'Warfarin / acenocoumarol'], ['hirudin', 'Hirudin'], ['coumarin', 'Coumarin'], ['lmwh', 'Low molecular weight heparin (IV)'], ['ufh', 'Unfractionated heparin (IV)'], ['other', 'Other anticoagulant']].flatMap(([k, l]) => [
            yn('m_' + k, l, { required: true }),
            text('m_' + k + '_dose', l + ' · current dose', { required: true, showIf: { id: 'm_' + k, eq: 'Yes' } }),
            { id: 'm_' + k + '_chg', label: l + ' · date of last dose change', type: 'date', noFuture: true, showIf: { id: 'm_' + k, eq: 'Yes' } },
          ]),
          text('m_other_name', 'Name of other drug', { required: true, showIf: { id: 'm_other', eq: 'Yes' } }),
        ],
      },
      declaration,
    ],
    rules: patientRules,
  },

  culture: {
    id: 'culture', title: 'Culture', docNo: 'YLO/TRF/CULT/00',
    blurb: 'Culture and sensitivity, stains, CBNAAT',
    sections: [
      patient, clinician,
      {
        title: 'Specimen',
        fields: [
          { id: 'sp_type', label: 'Specimen type', type: 'checks', required: true, options: ['Blood', 'Pus / purulent fluid', 'Sputum', 'Pleural fluid', 'Synovial fluid', 'Ascitic fluid', 'CSF', 'Urine', 'Semen', 'Stool', 'Other body fluid', 'Other'] },
          text('sp_other', 'Other specimen (specify)', { required: true, showIf: { id: 'sp_type', has: 'Other' } }),
          { id: 'sp_urine', label: 'Urine source', type: 'radio', required: true, options: ['Clean-catch midstream', 'Catheterised', 'Suprapubic aspirate', 'Other'], showIf: { id: 'sp_type', has: 'Urine' } },
          { id: 'sp_when', label: 'Date and time of collection', type: 'datetime', required: true, noFuture: true },
          text('sp_temp', 'Storage / transport temperature'),
          text('sp_diag', 'Diagnosis', { maxLen: 300 }),
        ],
      },
      {
        title: 'Clinical risk factors',
        fields: [
          { id: 'r_factors', label: 'Tick any that apply or are suspected', type: 'checks', options: ['Recent surgery', 'Renal failure', 'Surgical implant', 'Sepsis / organ failure', 'Immunocompromised', 'Healthcare-associated infection', 'Malignancy'] },
          text('r_surg', 'Surgical procedure details', { required: true, showIf: { id: 'r_factors', has: 'Recent surgery' } }),
          text('r_implant', 'Type and date of implant insertion', { required: true, showIf: { id: 'r_factors', has: 'Surgical implant' } }),
          yn('r_prev', 'Culture sent before (same or other site)', { required: true }),
          text('r_prev_lab', 'Previous lab no.', { showIf: { id: 'r_prev', eq: 'Yes' } }),
          { id: 'r_abx', label: 'Antimicrobials received (drug, dose, duration)', type: 'textarea', hint: 'Write "None" if none.', required: true },
        ],
      },
      {
        title: 'Investigation required',
        fields: [
          { id: 'inv', label: 'Investigations', type: 'checks', required: true, options: ['Gram stain', 'Aerobic culture & sensitivity', 'Automated culture & sensitivity', 'Fungal culture', "Albert's stain", 'ZN (AFB) stain', 'CBNAAT', 'Stool for culture & sensitivity', 'Hanging drop', 'KOH mount', 'India ink', 'Other'] },
          text('inv_other', 'Other investigation (specify)', { required: true, showIf: { id: 'inv', has: 'Other' } }),
        ],
      },
      declaration,
    ],
    rules: patientRules,
  },

  cytology: {
    id: 'cytology', title: 'Cytology', docNo: 'YLO/TRF/CYTO/00',
    blurb: 'Fluid cytology, FNAC, PAP smear / LBC',
    sections: [
      patient, clinician,
      {
        title: 'Nature of specimen',
        fields: [
          { id: 'n_fluid', label: 'Fluid cytology', type: 'checks', options: ['Pleural fluid', 'Ascitic fluid', 'Synovial fluid', 'BAL fluid', 'Cerebrospinal fluid', 'Urine for cytology', 'Pus for cytology', 'Other'] },
          { id: 'n_guide', label: 'Guided FNAC', type: 'radio', options: ['Ultrasound-guided', 'CT-guided', 'Unguided'] },
          text('n_site', 'FNAC site / organ', { required: true, showIf: { id: 'n_guide', notEmpty: true } }),
          { id: 'n_pap', label: 'Cervical screening', type: 'radio', options: ['PAP smear · conventional', 'PAP smear · liquid-based (LBC)', 'LBC + HPV 16, 18', 'LBC + HPV 16, 18 and rare variants', 'HPV 16, 18 only', 'HPV 16, 18 and rare variants only'] },
          { id: 'n_slides', label: 'Slides / cell block', type: 'checks', options: ['Cell block', 'Air-dried slides', 'Fixed slides', 'Other'] },
          { id: 'n_note', type: 'note', label: 'A cell block is made by default for pleural fluid, ascitic fluid and BAL fluid.' },
          { id: 'n_collected', label: 'Date and time of collection', type: 'datetime', required: true, noFuture: true },
        ],
      },
      {
        title: 'Clinical information',
        fields: [
          { id: 'k_find', label: 'Clinical findings', type: 'textarea', required: true },
          { id: 'k_pap', label: 'Previous PAP findings, if any', type: 'textarea', showIf: { id: 'n_pap', notEmpty: true } },
          { id: 'k_consent', label: 'The patient-signed consent for FNAC / PAP smear is attached or recorded.', type: 'bool', required: true, showIf: { id: 'k_needsconsent', eq: true } },
        ],
      },
      declaration,
    ],
    rules: [
      ...patientRules,
      { type: 'anyChecked', ids: ['n_fluid', 'n_guide', 'n_pap', 'n_slides'], errorOn: 'n_fluid', message: 'Choose at least one specimen type' },
    ],
    // consent is only needed for FNAC or PAP; the client sets this derived flag
    derive(data) { return { ...data, k_needsconsent: !!(data.n_guide || data.n_pap) }; },
  },

  histopathology: {
    id: 'histopathology', title: 'Histopathology', docNo: 'YLO/TRF/HIST/00',
    blurb: 'Biopsy and resection specimens',
    sections: [
      patient, clinician,
      {
        title: 'Test and specimen',
        fields: [
          { id: 'h_test', label: 'Test required', type: 'textarea', required: true },
          { id: 'h_type', label: 'Type of specimen', type: 'checks', required: true, options: ['Biopsy', 'Excision / resection', 'Frozen section', 'Bone marrow biopsy', 'Fluid cell block', 'Other'] },
          text('h_desc', 'Specimen description and number of containers', { required: true, maxLen: 300 }),
          { id: 'h_collected', label: 'Date and time of collection', type: 'datetime', required: true, noFuture: true },
        ],
      },
      {
        title: 'Clinical details',
        fields: [
          { id: 'h_findings', label: 'Clinical / radiological findings', type: 'textarea', required: true },
          { id: 'h_site', label: 'Site of collection with clinical details', type: 'textarea', required: true },
          { id: 'h_formalin', label: 'The specimen was put in 10% buffered neutral formalin straight after removal, at least three times the volume of the specimen.', type: 'bool', required: true },
        ],
      },
      declaration,
    ],
    rules: patientRules,
  },
};

export const FORM_LIST = Object.values(FORMS).map(f => ({ id: f.id, title: f.title, docNo: f.docNo, blurb: f.blurb }));
