import {encodeSpeech} from './speakjet';

// English text to SpeakJet words, for the AtariVox "say text" block: letter-to-sound rules in the style of the Naval Research Laboratory's
// 1976 rules (a letter or letters, the letters before and after it, and the sounds they make), a short list of words the rules get wrong, and a
// table that turns the sounds (ARPAbet names) into the SpeakJet's allophones. It is a rough reader: it says most plain English words in a way
// that can be understood, but not every word, so a phrase that has to be right can be written in SpeakJet words with "AtariVox say phonemes".

// What the letters around a match may be: # one or more vowels, : any consonants, ^ one consonant, . a voiced consonant, + a front vowel (E I Y),
// % an ending (ER E ES ED ING ELY), a space is the end of the word.
const SYMBOLS = {
  '#': '[AEIOUY]+',
  ':': '[BCDFGHJKLMNPQRSTVWXZ]*',
  '^': '[BCDFGHJKLMNPQRSTVWXZ]',
  '.': '[BDVGJLMNRWZ]',
  '+': '[EIY]',
  '%': '(?:ER|E|ES|ED|ING|ELY)',
};
const contextRegex = (pattern, end) => {
  const source = pattern.split('').map((char) => SYMBOLS[char] || char.replace(/[^A-Z ]/g, '')).join('');
  return new RegExp(end === 'left' ? `(?:${source})$` : `^(?:${source})`);
};

// 'left(match)right=sounds' (a space in the left or the right is the end of the word).
const RULE_TEXT = {
  A: [
    ' (A) =AX', ' (ARE) =AA R', ' (AR)O=AX R', '(AR)#=EH R', ' ^(AS)#=EY S', '(A)WA=AX', '(AW)=AO', ' :(ANY)=EH N IY', '(A)^+#=EY',
    '#:(ALLY)=AX L IY', ' (AL)#=AX L', '(AGAIN)=AX G EH N', '#:(AG)E=IH JH', '(A)^%=EY', '(A)^+:#=AE', ' :(A)^+ =EY', '(ARR)=AX R',
    '^(AR) =AA R', '(AR) =ER', '(AR)=AA R', '(AIR)=EH R', '(AI)=EY', '(AY)=EY', '(AU)=AO', '#:(AL) =AX L', '#:(ALS) =AX L Z', '(ALK)=AO K',
    '(AL)^=AO L', ' :(ABLE)=EY B AX L', '(ABLE)=AX B AX L', '(A)VO=EY', '(ANG)+=EY N JH', '(A)TOM=AE', '(A)TTI=AE', '(A)=AE',
  ],
  B: [' (BE)^#=B IH', '(BEING)=B IY IH NG', ' (BOTH) =B OW TH', ' (BUS)#=B IH Z', '(BUIL)=B IH L', '(B)=B'],
  C: [
    ' (CH)^=K', '^E(CH)=K', '(CH)=CH', ' S(CI)#=S AY', '(CI)A=SH', '(CI)O=SH', '(CI)EN=SH', '(C)+=S', '(CK)=K', '(COM)%=K AH M',
    '(C)=K',
  ],
  D: [
    '#:(DED) =D IH D', '.E(D) =D', '#:^E(D) =T', ' (DE)^#=D IH', ' (DO) =D UW', ' (DOES)=D AH Z', '(DONE) =D AH N', '(DOING)=D UW IH NG',
    ' (DOW)=D AW', '(DU)A=JH UW', '(D)=D',
  ],
  E: [
    '#:(E) =', ' :(E) =IY', '#(ED) =D', '(EV)ER=EH V', '(E)^%=IY', '(ERI)#=IY R IY', '(ERI)=EH R IH', '#:(ER)#=ER', '(ER)#=EH R',
    '(ER)=ER', ' (EVEN)=IY V EH N', '#:(E)W=', '(EW)=Y UW', '(E)O=IY', '#:(ES) =IH Z', '#:(E)S =', '#:(ELY) =L IY',
    '#:(EMENT)=M EH N T', '(EFUL)=F UH L', '(EE)=IY', '(EARN)=ER N', ' (EAR)^=ER', '(EAD)=EH D', '#:(EA) =IY AX', '(EA)SU=EH', '(EA)=IY',
    '(EIGH)=EY', '(EI)=IY', ' (EYE)=AY', '(EY)=IY', '(EU)=Y UW', '(EQUAL)=IY K W AX L', '(E)=EH',
  ],
  F: ['(FUL)=F UH L', '(F)F=', '(F)=F'],
  G: [
    '(GIV)=G IH V', ' (G)I^=G', '(GE)T=G EH', '(GG)=G', ' B#(G)=G', '(G)+=JH', '(GREAT)=G R EY T', '#(GH)=', '(G)=G',
  ],
  H: [' (HAV)=HH AE V', ' (HERE)=HH IY R', ' (HOUR)=AW ER', '(HOW)=HH AW', '(H)#=HH', '(H)='],
  I: [
    ' (IN)=IH N', ' (I) =AY', '(IN)D=AY N', ' ANT(I)=AY', '(IER)=IY ER', '#:R(IED) =IY D', '(IED) =AY D', '(IEN)=IY EH N',
    '(IE)T=AY EH', ' :(I)%=AY', '(I)%=IY', '(IE)=IY', ' (IDEA)=AY D IY AX', '(I)^+:#=IH', '(IR)#=AY R', '(IZ)%=AY Z', '(IS)%=AY Z',
    '+^(I)^+=AY', '#:^(I)^+=AY', '(IR)=ER', '(IGH)=AY', '(ILD)=AY L D', ' (IGN)=IH G N', '(IGN) =AY N', '(IGN)^=AY N',
    '(IGN)%=AY N', '(ICRO)=AY K R OW', '(IQUE)=IY K', '(I)=IH',
  ],
  J: ['(J)=JH'],
  K: [' (K)N=', '(K)=K'],
  L: ['(LO)C#=L OW', 'L(L)=', '#:^(L)%=AX L', '(LEAD)=L IY D', '(L)=L'],
  M: ['(MOV)=M UW V', '(M)=M'],
  N: ['E(NG)+=N JH', '(NG)R=NG G', '(NG)#=NG G', '(NGL)%=NG G AX L', '(NG)=NG', '(NK)=NG K', ' (NOW) =N AW', '#(NG) =NG G', '(N)=N'],
  O: [
    '(OF) =AX V', ' (OH) =OW', '(OROUGH)=ER OW', '#:(OR) =ER', '#:(ORS) =ER Z', '(OR)=AO R', ' (ONE)=W AH N', '(OW)=OW', ' (OVER)=OW V ER',
    '(OV)=AH V', '(O)^%=OW', '(O)^EN=OW', '(O)^I#=OW', '(OL)D=OW L', '(OUGHT)=AO T', '(OUGH)=AH F', ' (OU)=AW', 'H(OU)S#=AW', '(OUS)=AX S',
    '(OUR)=AO R', '(OULD)=UH D', '^(OU)^L=AH', '(OUP)=UW P', '(OU)=AW', '(OY)=OY', '(OING)=OW IH NG', '(OI)=OY', '(OOR)=AO R', '(OOK)=UH K',
    'F(OOD)=UW D', 'L(OOD)=AH D', 'M(OOD)=UW D', '(OOD)=UH D', 'F(OOT)=UH T', '(OO)=UW', '(O)E=OW', '(O) =OW', '(OA)=OW', ' (ONLY)=OW N L IY',
    ' (ONCE)=W AH N S', 'C(O)N=AA', '(O)NG=AO', ' :^(O)N=AH', 'I(ON)=AX N', '#:(ON) =AX N', '#^(ON)=AX N', '(O)ST =OW',
    '(OF)^=AO F', '(OTHER)=AH DH ER', 'R(O)B=AA', 'PR(O):#=UW', '(OS) =AH S', '(O)=AA',
  ],
  P: ['(PH)=F', '(PEOP)=P IY P', '(POW)=P AW', '(PUT) =P UH T', '(P)P=', '(P)=P'],
  Q: ['(QUAR)=K W AO R', '(QU)=K W', '(Q)=K'],
  R: [' (RE)^#=R IY', '(R)R=', '(R)=R'],
  S: [
    '(SH)=SH', '#(SION)=ZH AX N', '(SOME)=S AH M', '#(SUR)#=ZH ER', '(SURE)=SH UH R', '#(SU)#=ZH UW', '#(SSU)#=SH UW', '#(SED)=Z D', '#(S)#=Z',
    '(SAID)=S EH D', '^(SION)=SH AX N', '(S)S=', '.(S) =Z', '#:.E(S) =Z', '#:^#(S) =S', 'U(S) =S', ' :#(S) =Z', '##(S) =Z', ' (SCH)=S K',
    '(S)C+=', '#(SM)=Z M', '(S)=S',
  ],
  T: [
    ' (THE) #=DH IY', ' (THE) =DH AX', '(TO) =T UW', ' (THAT)=DH AE T', ' (THIS) =DH IH S', ' (THEY)=DH EY', ' (THERE)=DH EH R', '(THER)=DH ER',
    '(THEIR)=DH EH R', ' (THAN) =DH AE N', ' (THEM) =DH EH M', '(THESE) =DH IY Z', ' (THEN)=DH EH N', '(THROUGH)=TH R UW', '(THOSE)=DH OW Z',
    '(THOUGH) =DH OW', '(TODAY)=T AX D EY', '(TOMO)=T AX M AA', '(TO)T=T UW', '(THUS)=DH AH S', '(TH)=TH', '#:(TED) =T IH D', 'S(TI)#N=CH',
    '(TI)O=SH', '(TI)A=SH', '(TIEN)=SH AX N', '(TUR)#=CH ER', '(TU)A=CH UW', ' (TWO)=T UW', '(T)=T',
  ],
  U: [
    ' (UN)I=Y UW N', ' (UN)=AH N', ' (UPON)=AX P AO N', '(UR)#=Y UH R', '(UR)=ER', '(U)^ =AH', '(U)^^=AH', '(UY)=AY', ' G(U)#=',
    'G(U)%=', 'G(U)#=W', '#N(U)=Y UW', '(U)=Y UW',
  ],
  V: ['(VIEW)=V Y UW', '(V)=V'],
  W: [
    ' (WERE)=W ER', '(WA)SH=W AA', '(WA)ST=W EY', '(WA)S=W AH', '(WA)T=W AA', '(WHERE)=WH EH R', '(WHAT)=WH AH T', '(WHOL)=HH OW L', '(WHO)=HH UW',
    '(WH)=WH', '(WAR)=W AO R', '(WOR)^=W ER', '(WR)=R', '(W)=W',
  ],
  X: [' (X)=Z', '(X)=K S'],
  Y: [
    '(YOUNG)=Y AH NG', ' (YOU)=Y UW', ' (YES)=Y EH S', ' (Y)=Y', '#:^(Y) =IY', '#:^(Y)I=IY', ' :(Y) =AY', ' :(Y)#=AY', ' :(Y)^+:#=IH', ' :(Y)^#=AY',
    '(Y)=IH',
  ],
  Z: ['(Z)=Z'],
};

const RULES = {};
Object.entries(RULE_TEXT).forEach(([letter, list]) => {
  RULES[letter] = list.map((text) => {
    const found = /^(.*)\((.*)\)(.*)=(.*)$/.exec(text);
    const [, left, match, right, sounds] = found;
    return {
      match,
      left: left ? contextRegex(left, 'left') : null,
      right: right ? contextRegex(right, 'right') : null,
      sounds: sounds ? sounds.split(' ') : [],
    };
  });
});

// Words that the rules do not say well, as sounds.
const WORDS = {
  A: 'AX', THE: 'DH AX', TO: 'T UW', OF: 'AX V', AND: 'AE N D', IS: 'IH Z', IN: 'IH N', IT: 'IH T', YOU: 'Y UW', YOUR: 'Y AO R', I: 'AY', ARE: 'AA R',
  WAS: 'W AH Z', FOR: 'F AO R', WITH: 'W IH TH', FROM: 'F R AH M', MY: 'M AY', HE: 'HH IY', SHE: 'SH IY', WE: 'W IY', BE: 'B IY', ME: 'M IY',
  THIS: 'DH IH S', THAT: 'DH AE T', ONE: 'W AH N', TWO: 'T UW', THREE: 'TH R IY', FOUR: 'F AO R', FIVE: 'F AY V', SIX: 'S IH K S',
  SEVEN: 'S EH V AX N', EIGHT: 'EY T', NINE: 'N AY N', TEN: 'T EH N', ELEVEN: 'IH L EH V AX N', TWELVE: 'T W EH L V', TWENTY: 'T W EH N T IY',
  THIRTY: 'TH ER T IY', FORTY: 'F AO R T IY', FIFTY: 'F IH F T IY', SIXTY: 'S IH K S T IY', SEVENTY: 'S EH V AX N T IY', EIGHTY: 'EY T IY',
  NINETY: 'N AY N T IY', HUNDRED: 'HH AH N D R AX D', THOUSAND: 'TH AW Z AX N D', ZERO: 'Z IY R OW', GAME: 'G EY M', OVER: 'OW V ER',
  PLAYER: 'P L EY ER', PLAY: 'P L EY', PRESS: 'P R EH S', FIRE: 'F AY ER', BUTTON: 'B AH T AX N', START: 'S T AA R T', READY: 'R EH D IY',
  GO: 'G OW', SCORE: 'S K AO R', HIGH: 'HH AY', WIN: 'W IH N', WINNER: 'W IH N ER', LOSE: 'L UW Z', LOSER: 'L UW Z ER', LEVEL: 'L EH V AX L',
  STAGE: 'S T EY JH', BONUS: 'B OW N AX S', EXTRA: 'EH K S T R AX', LIFE: 'L AY F', LIVES: 'L AY V Z', TIME: 'T AY M', UP: 'AH P',
  DOWN: 'D AW N', LEFT: 'L EH F T', RIGHT: 'R AY T', WELCOME: 'W EH L K AH M', HELLO: 'HH EH L OW', GOODBYE: 'G UH D B AY', GOOD: 'G UH D',
  GREAT: 'G R EY T', NICE: 'N AY S', WORK: 'W ER K', OH: 'OW', YES: 'Y EH S', NO: 'N OW', NEW: 'N UW', BRICKS: 'B R IH K S',
  BRICK: 'B R IH K', OLYMPUS: 'AX L IH M P AX S', ATARI: 'AX T AA R IY', WARNING: 'W AO R N IH NG', DANGER: 'D EY N JH ER', HURRY: 'HH ER IY',
  LOOK: 'L UH K', OUT: 'AW T', AGAIN: 'AX G EH N', TRY: 'T R AY', NEXT: 'N EH K S T', FINAL: 'F AY N AX L', BOSS: 'B AO S', PAUSE: 'P AO Z',
  PAUSED: 'P AO Z D', MISSION: 'M IH SH AX N', COMPLETE: 'K AX M P L IY T', COMPLETED: 'K AX M P L IY T IH D', FAILED: 'F EY L D',
  PERFECT: 'P ER F IH K T', AMAZING: 'AX M EY Z IH NG', SUPER: 'S UW P ER', NOW: 'N AW', WHAT: 'WH AH T', WHO: 'HH UW', WHERE: 'WH EH R',
  HAVE: 'HH AE V', DO: 'D UW', DOES: 'D AH Z', SAID: 'S EH D', THERE: 'DH EH R', THEIR: 'DH EH R', THEY: 'DH EY', WERE: 'W ER', COULD: 'K UH D',
  WOULD: 'W UH D', SHOULD: 'SH UH D', SOME: 'S AH M', COME: 'K AH M', LOVE: 'L AH V', MOVE: 'M UW V', GIVE: 'G IH V', LIVE: 'L IH V',
};

const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN',
  'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const numberWords = (n) => {
  if (n < 20) return [ONES[n]];
  if (n < 100) return [TENS[Math.floor(n / 10)], ...(n % 10 ? [ONES[n % 10]] : [])];
  if (n < 1000) return [ONES[Math.floor(n / 100)], 'HUNDRED', ...(n % 100 ? numberWords(n % 100) : [])];
  if (n < 1000000) return [...numberWords(Math.floor(n / 1000)), 'THOUSAND', ...(n % 1000 ? numberWords(n % 1000) : [])];
  return String(n).split('').map((digit) => ONES[Number(digit)]);
};

// The sounds of one word (letters only, upper case).
export const wordSounds = (word) => {
  if (word in WORDS) return WORDS[word].split(' ');
  const padded = ` ${word} `;
  const out = [];
  let at = 1;
  while (at < padded.length - 1) {
    const rules = RULES[padded[at]];
    let used = null;
    if (rules) {
      used = rules.find((rule) => padded.startsWith(rule.match, at) &&
        (!rule.left || rule.left.test(padded.slice(0, at))) && (!rule.right || rule.right.test(padded.slice(at + rule.match.length))));
    }
    if (used) {
      out.push(...used.sounds);
      at += used.match.length;
    } else {
      at++;
    }
  }
  return out;
};

// ARPAbet sounds to SpeakJet allophones. A consonant has two forms, one for next to a front vowel and one for next to the others.
const FRONT_VOWELS = new Set(['IY', 'IH', 'EY', 'EH', 'AE', 'Y']);
const VOWELS = new Set(['IY', 'IH', 'EY', 'EH', 'AE', 'AA', 'AO', 'AH', 'AX', 'UH', 'UW', 'OW', 'AW', 'AY', 'OY', 'ER']);
const VOWEL_ALLOPHONES = {
  IY: 'IY', IH: 'IH', EY: 'EYIY', EH: 'EH', AE: 'AY', AA: 'AW', AO: 'AW', AH: 'UX', AX: 'AX', UH: 'UH', UW: 'UW', OW: 'OWWW', AW: 'AYWW', AY: 'OHIY',
  OY: 'OWIY', ER: 'AXRR',
};
const R_VOWELS = {AA: 'AWRR', AO: 'OWRR', EH: 'EYRR', IH: 'IYRR', IY: 'IYRR', UH: 'OWRR', EY: 'EYRR', AX: 'AXRR'};
// consonant: [before a front vowel, before another vowel, after a front vowel (end), after another vowel (end)]
const CONSONANTS = {
  B: ['BE', 'BO', 'EB', 'OB'], D: ['DE', 'DO', 'ED', 'OD'], G: ['GE', 'GO', 'EG', 'OG'], K: ['KE', 'KO', 'EK', 'OK'], P: ['PE', 'PO', 'PE', 'PO'],
  HH: ['HE', 'HO', 'HE', 'HO'], L: ['LE', 'LO', 'LE', 'LO'], N: ['NE', 'NO', 'NE', 'NO'], NG: ['NGE', 'NGO', 'NGE', 'NGO'], S: ['SE', 'SO', 'SE', 'SO'],
  T: ['TU', 'TU', 'TT', 'TT'],
};
const PLAIN = {M: 'MM', R: 'RR', W: 'WW', WH: 'WH', Y: 'IYEH', F: 'FF', V: 'VV', Z: 'ZZ', ZH: 'ZH', TH: 'TH', DH: 'DH', SH: 'SH', CH: 'CH', JH: 'JH'};

export const soundsToSpeakJet = (sounds) => {
  const out = [];
  for (let i = 0; i < sounds.length; i++) {
    const sound = sounds[i];
    const next = sounds[i + 1];
    const previous = sounds[i - 1];
    if (VOWELS.has(sound)) {
      if (next === 'R' && R_VOWELS[sound] && !(sounds[i + 2] && VOWELS.has(sounds[i + 2]))) {
        out.push(R_VOWELS[sound]);
        i++;
      } else {
        out.push(VOWEL_ALLOPHONES[sound]);
      }
    } else if (CONSONANTS[sound]) {
      const forms = CONSONANTS[sound];
      if (next && VOWELS.has(next)) out.push(FRONT_VOWELS.has(next) ? forms[0] : forms[1]);
      else out.push(previous && FRONT_VOWELS.has(previous) ? forms[2] : forms[3]);
    } else if (PLAIN[sound]) {
      out.push(PLAIN[sound]);
    }
  }
  return out;
};

// A project's pronunciations (the Text tab): a line for each word, "WORD = SpeakJet words", that are said instead of what the rules make.
// Returns a Map from the upper case word to its SpeakJet words.
export const parsePronunciations = (text) => {
  const map = new Map();
  String(text || '').split(/\r?\n/).forEach((line) => {
    const found = /^\s*([A-Za-z']+)\s*[=:]\s*(.+?)\s*$/.exec(line);
    if (found) map.set(found[1].toUpperCase().replace(/'/g, ''), found[2].toUpperCase());
  });
  return map;
};

// SpeakJet words for some English text: the words of the text, numbers spelled out, a short pause for a comma and a longer one for the end of a
// sentence. `pronunciations` (a Map, see parsePronunciations) says words the way the project wants them.
export const textToSpeakJetWords = (text, pronunciations = null) => {
  const tokens = String(text || '').toUpperCase().match(/[A-Z']+|\d+|[,;:.!?\n]/g) || [];
  const words = [];
  tokens.forEach((token) => {
    if (/^\d+$/.test(token)) {
      numberWords(Number(token)).forEach((word) => words.push(...soundsToSpeakJet(wordSounds(word)), 'PAUSE30'));
    } else if (/^[,;:]$/.test(token)) {
      words.push('PAUSE90');
    } else if (/^[.!?\n]$/.test(token)) {
      words.push('PAUSE200');
    } else {
      const word = token.replace(/'/g, '');
      if (pronunciations && pronunciations.has(word)) words.push(pronunciations.get(word), 'PAUSE30');
      else words.push(...soundsToSpeakJet(wordSounds(word)), 'PAUSE30');
    }
  });
  return words.join(' ');
};

// The bytes for some English text (see textToSpeakJetWords).
export const encodeText = (text, pronunciations = null) => encodeSpeech(textToSpeakJetWords(text, pronunciations));

// What a message of the Text tab is spoken as: the SpeakJet words written for it on its card, or else the rules' (with the project's
// pronunciations). `strings` is the text strings storage (its `pronunciations` is the project's list).
export const speechWordsFor = (entry, strings) => {
  if (!entry) return '';
  if (entry.speech && entry.speech.trim()) return entry.speech.trim().toUpperCase();
  return textToSpeakJetWords(entry.text, parsePronunciations(strings && strings.pronunciations));
};
