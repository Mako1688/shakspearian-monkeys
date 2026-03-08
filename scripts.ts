/* ============================================
   Shakespearian Monkeys – Game Logic
   ============================================ */

// --------------- Constants & Types ---------------

const SAVE_KEY = "shakespearian-monkeys-save";
const AUTO_SAVE_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 100; // 10 ticks per second

const MAX_WORD_LENGTH = 8;
const MIN_WORD_LENGTH = 3;

interface UpgradeDef {
  baseCost: number;
  costMultiplier: number;
  lpsAdd: number;       // flat LPS added per unit
  lpsMultiplier: number; // multiplicative bonus per unit
}

interface GameState {
  bananas: number;
  totalLetters: number;
  clickPower: number;
  upgrades: Record<UpgradeId, number>;
  wordBuffer: string;
  recentWords: string[];
  wordCounts: Record<string, number>;
  totalWordsFound: number;
  lastSaveTime: number;
}

type UpgradeId = "monkey" | "typewriter" | "training" | "quill";

const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  monkey:     { baseCost: 10,   costMultiplier: 1.15, lpsAdd: 1,  lpsMultiplier: 1 },
  typewriter: { baseCost: 50,   costMultiplier: 1.25, lpsAdd: 5,  lpsMultiplier: 1 },
  training:   { baseCost: 500,  costMultiplier: 1.50, lpsAdd: 0,  lpsMultiplier: 2 },
  quill:      { baseCost: 5000, costMultiplier: 1.75, lpsAdd: 0,  lpsMultiplier: 10 },
};

// ~1200 common English words (3–8 letters, lowercase a-z only)
const WORD_LIST: readonly string[] = [
  // 3-letter words
  "the","and","for","are","but","not","you","all","can","had","her","was","one",
  "our","out","day","get","has","him","his","how","its","may","new","now","old",
  "see","way","who","did","boy","got","let","say","she","too","use","dad","mom",
  "run","big","end","far","few","own","put","red","sit","top","try","ask","ago",
  "air","bad","bed","car","cut","dog","ear","eat","egg","eye","fly","fun","gun",
  "hat","hit","hot","ice","ill","job","key","kid","lay","leg","lie","lip","lot",
  "low","man","map","met","mix","net","nor","oil","pay","pen","per","pet",
  "pin","pop","pot","raw","rid","row","sad","sat","sea","set","six","sky","son",
  "sum","sun","ten","tie","tip","toe","two","van","war","wet","win","won","yes",
  "yet","age","aid","aim","art","bag","ban","bar","bat","bay","bit","bow","box",
  "bug","bus","buy","cap","cat","cop","cow","cry","cup","die","dig","dip","dot",
  "dry","due","dug","fan","fat","fee","fit","fix","fog","gap","gas","god","guy",
  "hey","hid","hip","hug","jaw","joy","lab","lap","led","log","mad","mud","nod",
  "nut","odd","pad","pal","pan","pat","pig","pit","pub","rag","ran","rat","raw",
  "ray","rib","rip","rob","rod","rot","rub","rug","sad","sag","sap","saw","sew",
  "shy","sin","sip","sir","sob","sod","spy","tab","tag","tan","tap","tar","tax",
  "tea","tin","ton","tub","tug","vet","vow","wag","web","wig","wit","woe","wok",
  "yam","yap","yaw","zap","zen","zip","zoo",
  // 4-letter words
  "that","with","have","this","will","your","from","they","been","call","come",
  "each","find","give","good","hand","help","here","home","just","keep","know",
  "last","like","long","look","made","make","many","more","most","much","must",
  "name","need","next","only","over","part","play","same","said","some","such",
  "take","tell","than","them","then","time","very","want","well","what","when",
  "wide","word","work","year","also","area","army","away","baby","back","ball",
  "band","bank","base","bear","beat","bill","blue","boat","body","bomb","bond",
  "bone","book","born","both","burn","busy","card","care","case","cast","cent",
  "city","club","coat","code","cold","cook","cool","cope","copy","core","cost",
  "crew","crop","dark","data","date","dead","deal","dear","deep","deny","diet",
  "disk","does","done","door","down","draw","drew","drop","drug","dual","duke",
  "dust","duty","earn","ease","east","easy","edge","else","even","ever","evil",
  "exam","exec","exit","face","fact","fail","fair","fall","fame","farm","fast",
  "fate","fear","feed","feel","feet","fell","file","fill","film","firm","fish",
  "flat","flow","fold","folk","food","foot","form","four","free","fuel","full",
  "fund","gain","game","gate","gave","gift","girl","glad","goal","goes","gold",
  "golf","gone","grab","gray","grew","grow","gulf","hair","half","hall","hang",
  "hard","harm","hate","head","hear","heat","held","hero","hide","high","hill",
  "hire","hold","hole","host","hour","huge","hung","hunt","hurt","idea","inch",
  "iron","item","jack","jean","join","joke","jump","jury","keen","kind","king",
  "knee","knew","lack","laid","lake","land","lane","late","lead","left","lend",
  "less","lift","line","link","list","live","load","loan","lock","lone","lord",
  "lose","loss","lost","love","luck","lung","mail","main","male","mark","mass",
  "mate","meal","mean","meat","meet","mile","milk","mind","mine","miss","mode",
  "mood","moon","move","myth","nail","neat","neck","news","nice","nine","none",
  "nose","note","odds","okay","once","open","pace","pack","page","paid","pain",
  "pair","pale","palm","park","pass","past","path","peak","pick","pile","pink",
  "pipe","plan","plot","plus","poem","poet","poll","pool","poor","port","post",
  "pour","pray","pull","pure","push","quit","race","rage","rain","rank","rare",
  "rate","read","real","rear","rely","rent","rest","rice","rich","ride","ring",
  "rise","risk","road","rock","role","roll","roof","room","root","rope","rose",
  "rule","rush","safe","sail","sake","sale","salt","sand","sang","save","seal",
  "seat","seed","seek","seem","seen","self","sell","send","sept","ship","shop",
  "shot","show","shut","sick","side","sign","silk","sing","site","size","skin",
  "slip","slow","snap","snow","soft","soil","sold","sole","song","soon","sort",
  "soul","span","spin","spot","star","stay","stem","step","stop","such","suit",
  "sure","swim","tail","tale","talk","tall","tank","tape","task","taxi","team",
  "tend","term","test","text","thin","thus","tied","till","tiny","tire","told",
  "toll","tone","took","tool","tour","town","trap","tree","trim","trip","true",
  "tube","luck","turn","twin","type","ugly","unit","upon","used","user","vast",
  "vice","view","vote","wage","wait","wake","walk","wall","wave","weak","wear",
  "week","weigh","west","whom","wild","wine","wing","wire","wise","wish","wood",
  "wore","wrap","yard","yeah","zone",
  // 5-letter words
  "about","after","again","being","below","could","every","first","found","great",
  "house","large","later","never","other","place","point","right","small","sound",
  "still","think","three","under","water","where","which","while","world","would",
  "write","young","above","admit","adopt","adult","agent","agree","ahead","alarm",
  "album","alien","align","alive","allow","alone","along","alter","among","anger",
  "angle","angry","apple","apply","arena","argue","arise","aside","award","awful",
  "basic","batch","beach","began","begin","bench","birth","black","blade","blame",
  "blank","blast","blaze","bleed","blend","bless","blind","block","blood","blown",
  "board","boost","brain","brave","bread","break","breed","brick","brief","bring",
  "broad","broke","brown","brush","build","bunch","burst","buyer","cabin","cable",
  "carry","catch","cause","chain","chair","chaos","charm","chart","chase","cheap",
  "check","chess","chest","chief","child","China","chunk","claim","class","clean",
  "clear","climb","clock","close","cloud","coach","coast","count","court","cover",
  "crack","craft","crash","crazy","cream","crime","cross","crowd","cruel","crush",
  "curve","cycle","daily","dance","death","debug","decay","delay","delta","dense",
  "depth","devil","dirty","doubt","dozen","draft","drain","drama","drawn","dream",
  "dress","dried","drift","drink","drive","drove","dying","eager","early","earth",
  "eight","elite","empty","enemy","enjoy","enter","equal","error","essay","event",
  "exact","exist","extra","faith","false","fault","feast","fence","fever","fiber",
  "field","fifth","fifty","fight","final","fixed","flame","flesh","float","flood",
  "floor","flour","focus","force","forge","forth","forum","frame","fresh","front",
  "fruit","fully","giant","given","glass","globe","going","grace","grade","grain",
  "grand","grant","graph","grasp","grass","grave","green","gross","group","grown",
  "guard","guess","guide","guilt","happy","harsh","heart","heavy","hence","horse",
  "hotel","human","humor","ideal","image","imply","index","inner","input","issue",
  "ivory","joint","judge","juice","knock","known","label","labor","layer","learn",
  "least","leave","legal","level","light","limit","lived","local","logic","loose",
  "lover","lower","loyal","lucky","lunch","lying","magic","major","maker","march",
  "match","mayor","meant","media","mercy","merit","metal","meter","might","minor",
  "minus","model","money","month","moral","motor","mount","mouse","mouth","movie",
  "music","naive","nerve","night","noble","noise","north","noted","novel","nurse",
  "occur","ocean","offer","often","opera","order","organ","ought","outer","owner",
  "paint","panel","panic","paper","party","patch","pause","peace","penny","phase",
  "phone","photo","piano","piece","pilot","pitch","pixel","plain","plane","plant",
  "plate","plaza","plead","pluck","pouch","pound","power","press","price","pride",
  "prime","print","prior","prize","probe","proof","proud","prove","psalm","pupil",
  "queen","query","quest","queue","quick","quiet","quota","quote","radar","radio",
  "raise","range","rapid","ratio","reach","react","ready","realm","rebel","refer",
  "reign","relax","reply","rider","right","rigid","rival","river","robot","roman",
  "rough","round","route","royal","rural","sadly","saint","salad","scale","scene",
  "scope","score","sense","serve","seven","shade","shake","shall","shame","shape",
  "share","sharp","sheet","shelf","shell","shift","shine","shirt","shock","shoot",
  "shore","short","shout","sight","since","sixth","sixty","skill","skull","slash",
  "sleep","slice","slide","smile","smoke","snake","solve","sorry","south","space",
  "spare","speak","speed","spend","spent","spine","spite","split","spoke","spray",
  "squad","stack","staff","stage","stain","stake","stall","stamp","stand","stare",
  "start","state","steam","steel","steep","steer","stick","stock","stone","stood",
  "store","storm","story","strip","stuck","study","stuff","style","sugar","sunny",
  "super","surge","swear","sweep","sweet","swift","swing","sword","symbol","taste",
  "teach","tears","thank","theme","there","thick","thing","third","those","throw",
  "thumb","tight","tired","title","today","token","total","touch","tough","tower",
  "trace","track","trade","trail","train","trait","treat","trend","trial","tribe",
  "trick","tried","troop","truck","truly","trump","trust","truth","tumor","twice",
  "twist","ultra","union","unite","unity","until","upper","upset","urban","usage",
  "usual","valid","value","venue","verse","video","virus","visit","vital","vocal",
  "voice","waste","watch","weave","weird","whale","wheat","wheel","whole","wider",
  "woman","worth","wound","wrist","wrong","wrote","yield","youth",
  // 6-letter words
  "almost","always","before","behind","better","change","during","enough","family",
  "friend","future","giving","golden","happen","having","island","little","living",
  "making","market","matter","method","minute","modern","moment","moving","number",
  "office","online","people","person","pretty","public","really","reason","result",
  "second","should","simple","single","system","taking","trying","turned","useful",
  "within","accept","access","across","action","active","actual","affair","afford",
  "agency","amount","animal","annual","answer","anyway","appeal","appear","assume",
  "attack","attend","august","author","basket","battle","beauty","become","behalf",
  "belief","belong","beside","beyond","bishop","bitter","border","borrow","bottom",
  "bought","branch","breath","bridge","bright","broken","budget","burden","bureau",
  "button","camera","cancer","carbon","career","castle","caught","center","chance",
  "chapel","charge","chosen","circle","client","closed","coffee","column","combat",
  "common","comply","corner","costly","cotton","county","couple","course","covers",
  "create","credit","crisis","custom","damage","danger","deadly","dealer","debate",
  "decade","defeat","defend","define","degree","demand","denial","depend","deploy",
  "deputy","desert","design","desire","detail","detect","device","differ","dinner",
  "direct","divide","doctor","domain","double","driven","driver","easily","eating",
  "effect","effort","eighth","emerge","empire","enable","ending","energy","engage",
  "engine","ensure","entire","entity","equity","escape","estate","ethnic","evolve",
  "exceed","except","expand","expect","expert","export","expose","extend","extent",
  "fabric","fairly","fallen","farmer","father","figure","finger","finish","firmly",
  "flight","flower","follow","forced","forest","forget","formal","former","foster",
  "fourth","freely","frozen","garden","gather","gender","gentle","global","govern",
  "growth","guilty","handle","hardly","health","heaven","height","highly","honest",
  "horror","hungry","hunter","ignore","impact","import","impose","income","indeed",
  "Indian","inform","injury","insect","inside","insist","intact","intend","intent",
  "invest","invite","itself","junior","jungle","kidney","launch","latter","league",
  "length","lesson","letter","lights","likely","linear","liquid","listen","locate",
  "London","lovely","mainly","manage","manner","margin","marine","master","medium",
  "member","memory","mental","merely","middle","mingle","mirror","mobile","modest",
  "mother","motion","murder","museum","mutual","myself","namely","nation","nature",
  "nearby","nearly","needle","newest","nicely","nobody","normal","notice","obtain",
  "offend","option","orange","origin","outfit","output","palace","parade","parent",
  "partly","patent","patrol","peanut","permit","phrase","picked","pillow","planet",
  "player","please","pledge","plenty","pocket","poetry","poison","police","policy",
  "prefer","prince","prison","profit","prompt","proper","proven","purple","pursue",
  "racial","random","rather","record","reform","refuse","regard","regime","region",
  "reject","relate","relief","remain","remedy","remote","remove","render","rental",
  "repair","repeat","report","rescue","resign","resist","resort","retain","retire",
  "return","reveal","review","reward","ritual","robust","rotate","ruling","sacred",
  "safely","salary","sample","scheme","school","screen","search","season","secret",
  "sector","secure","select","senior","series","settle","severe","sexual","shadow",
  "shaken","shield","should","signal","silent","silver","simple","sister","sketch",
  "slight","smooth","social","solely","source","speech","spirit","spread","spring",
  "square","stable","statue","steady","stolen","strain","strand","stream","street",
  "stress","strict","strike","string","stroke","strong","struck","studio","submit",
  "sudden","suffer","summer","summit","supply","surely","survey","switch","talent",
  "target","temple","tenant","tender","terror","thanks","thirty","thread","thrill",
  "throat","thrown","tissue","tongue","toward","travel","treaty","tribal","tunnel",
  "twelve","unfair","unique","unlike","update","urging","valley","verbal","victim",
  "violet","virtue","vision","visual","volume","warmth","weapon","weekly","weight",
  "window","winner","winter","wisdom","wonder","worker","worthy","yellow",
  // 7-letter words
  "another","because","between","certain","command","company","control","country",
  "current","develop","display","example","finally","general","getting","himself",
  "however","hundred","imagine","include","instead","keeping","looking","machine",
  "million","morning","natural","nothing","outside","picture","problem","produce",
  "program","provide","quality","quickly","reading","receive","running","several",
  "society","someone","started","support","teacher","thought","through","turning",
  "walking","without","working","writing","ability","absence","academy","account",
  "achieve","acquire","address","advance","adverse","ancient","anxiety","anybody",
  "applied","arrange","article","assault","attempt","attract","auction","average",
  "backing","balance","banking","barrier","battery","bearing","because","bedroom",
  "besides","billion","cabinet","capable","capital","capture","careful","catalog",
  "central","chapter","charity","charter","chicken","chronic","circuit","citizen",
  "classic","climate","cluster","coastal","collect","combine","comfort","comment",
  "compete","concern","conduct","confirm","connect","consent","consist","contain",
  "content","context","convert","correct","counter","coupled","courage","crucial",
  "culture","cutting","dealing","declare","decline","default","defence","deficit",
  "deliver","density","deposit","desktop","despite","devoted","digital","disable",
  "disease","dismiss","distant","divided","donated","drawing","dynamic","earnest",
  "eastern","economy","edition","elderly","element","elevate","embrace","emotion",
  "emperor","endless","enforce","enhance","enquiry","episode","equally","essence",
  "evening","evident","examine","exactly","excited","exhibit","expense","explain",
  "exploit","explore","express","extreme","fashion","feature","fiction","finding",
  "fishing","fitness","foreign","forever","formula","fortune","forward","founder",
  "freedom","fulfill","funeral","further","genetic","genuine","gesture","habitat",
  "halfway","handful","happily","harbour","heading","healthy","hearing","heavily",
  "helpful","highway","history","holding","holiday","horizon","housing",
  "illegal","illness","imagine","obvious","opening","opinion","organic","outline",
  "overall","parking","partial","partner","passage","passing","patient","pattern",
  "payload","payment","peasant","penalty","pension","percent","perfect","perhaps",
  "persist","pioneer","plastic","pleased","pointed","portion","poverty","premium",
  "premier","prepare","present","prevent","primary","printer","privacy","private",
  "profile","project","promise","promote","prosper","protect","protest","proving",
  "publish","purpose","pursuit","pushing","quarter","radical","rapidly","readily",
  "reality","recover","reduced","reflect","regular","related","release","removal",
  "removed","replace","request","require","resolve","respect","respond","restore",
  "retired","retreat","returns","routine","roughly","satisfy","scatter","scholar",
  "scratch","section","segment","serious","service","serving","session","setting",
  "settler","shelter","shortly","sibling","sitting","skilled","slavery","smoking",
  "soldier","somehow","speaker","special","species","sponsor","squeeze","stadium",
  "station","storage","strange","stretch","student","subject","succeed","success",
  "suggest","summary","surface","surgeon","surplus","survive","suspect","sustain",
  "testing","theater","therapy","tobacco","tonight","totally","trading","tragedy",
  "trigger","triumph","trouble","turning","typical","undergo","uniform","unknown",
  "utterly","variety","vehicle","venture","version","veteran","victory","vintage",
  "violent","virtual","visible","visitor","welfare","western","whisper","willing",
  "witness","kitchen","meaning","measure","meeting","mention","mineral","missing",
  "mission","mistake","mixture","monitor","mystery","network","neutral","notable",
  "nuclear","nursing","observe","officer","operate",
  // 8-letter words
  "absolute","anything","becoming","building","business","children","complete",
  "consider","continue","creative","daughter","decision","describe","discover",
  "document","everyone","exercise","expected","exposure","finished","football",
  "function","generate","happened","hospital","identify","increase","interest",
  "involved","language","learning","material","medicine","midnight","mountain",
  "national","negative","notebook","numerous","official","organize","original",
  "painting","personal","platform","positive","possible","practice","prepared",
  "probably","progress","property","provided","question","reaction","remember",
  "research","resource","response","security","sentence","shopping","shoulder",
  "software","solution","specific","standard","strategy","strength","suddenly",
  "supposed","surprise","teaching","thinking","together","training","treasure",
  "trillion","umbrella","universe","valuable","whatever","yourself","academic",
  "accepted","accident","accurate","achieved","actually","addition","adequate",
  "adjusted","advanced","advocate","affected","afforded","alliance","although",
  "ambition","amounted","analysis","announce","annually","apparent","appetite",
  "approach","approval","argument","artistic","assembly","assuming","athletic",
  "attached","attorney","audience","autonomy","backward","balanced","bathroom",
  "becoming","behavior","birthday","blanking","bleeding","blooming","boarding",
  "bookmark","boundary","breaking","breeding","bringing","browsing","bulletin",
  "campaign","capacity","catching","category","cautious","ceremony","chairman",
  "champion","changing","checking","chemical","choosing","civilian","clearing",
  "climbing","clinical","clothing","coaching","collapse","colonial","colorado",
  "combined","comeback","comfort","commerce","commonly","communal","compared",
  "compiler","complain","composed","computer","conflict","congress","connects",
  "conquest","constant","consumer","contains","contrast","convince","corridor",
  "coverage","creation","criminal","critical","crossing","cultural","currency",
  "customer","database","deadline","debating","december","deciding","declared",
  "declined","decrease","defeated","defender","definite","delivery","demanded",
  "democrat","departed","deployed","designer","detailed","detector","devotion",
  "dialogue","diplomat","directed","director","disabled","disaster","discount",
  "disorder","dispatch","disposal","disposed","distance","distinct","district",
  "division","doctrine","domestic","dominant","donation","doorstep","doubtful",
  "download","downtown","dramatic","drawings","dropping","duration","dwelling",
  "economic","educated","educator","election","elegance","elevator","eligible",
  "embedded","emerging","emission","emphasis","employed","employee","employer",
  "encoding","engaging","engineer","enormous","enrolled","entirely","entitled",
  "entrance","envelope","equality","equipped","estimate","evaluate","eventual",
  "evidence","examined","examiner","exchange","exciting","executed","executor",
  "exemplar","exercise","existing","expanded","expedite","expelled","explicit",
  "extended","exterior","external","facility","familiar","favorite","featured",
  "february","feedback","festival","fiercely","figuring","filename","filmmaker",
  "filtered","finalist","finally","findings","firewall","flexible","floating",
  "flooding","folklore","fondness","foothill","football","forecast","formerly",
  "fourteen","fraction","fragment","franklin","freshman","friendly","frontier",
  "fruitful","fulltime","gambling","gathered","generate","generous","genocide",
  "geometry","glancing","glossary","goodness","governed","governor","graceful",
  "graduate","graphics","grateful","gripping","grooming","grounded","grouping",
  "guardian","guidance","habitual","handbook","handling","happened","hardware",
  "harmless","headline","heritage","honestly","honorary","hopeless","horrible",
  "humanity","humility","humorous","hydrogen","ignorant","illusion","imagined",
  "immature","imminent","immunity","imperial","implicit","imported","imposing",
  "impaired","improved","incident","inclined","includes","incoming","indexing",
  "indicate","indirect","industry","inferior","infinite","informal","informed",
  "inherent","inhaling","initiate","innocent","innovate","inspired","instance",
  "integral","intended","interact","interior","internal","interval","intimate",
  "inverted","investor","involved","isolated","judgment","junction","keyboard",
  "kingdom","labeling","landmark","landlord","laughing","launched","lawmaker",
  "layering","learning","leftover","likewise","limiting","listened","literacy",
  "literary","lifetime","lighting","likeness","lingered",
  "location","luckiest","luminous","magnetic","maintain","majority","managing",
  "manifest","mankind","manually","marathon","marginal","marriage","massacre",
  "mastered","material","maturity","maximize","meantime","measured","mechanic",
  "medieval","membrane","memorial","merchant","midnight","militant","military",
  "minimize","minister","minority","miracles","mistaken","mobility","modeling",
  "moderate","molecule","monetary","monopoly","moreover","mortgage","mounting",
  "movement","multiply","mundane","murdered","mutation","mutually","mystical",
  "narrowed","national","navigate","neighbor","nitrogen","nobleman","nominate",
  "nonsense","normally","northern","notation","November","objected","obtained",
  "obstacle","occasion","occupied","occurred","offering","official","offshore",
  "olympics","operated","operator","opponent","opposing","opposite","optimism",
  "optional","ordering","ordinary","organism","oriented","orthodox","outbreak",
  "outreach","overcome","overhead","overlook","overturn","overview","painting",
  "pamphlet","pandemic","parallel","parental","partisan","passport","patience",
  "peaceful","peasants","peculiar","pedagogy","penalize","perceive","periodic",
  "personal","persuade","petition","pharmacy","physical","planning","platform",
  "pleasant","pleasure","plunging","pointing","polished","politely","politics",
  "populace","populate","portrait","positron","powerful","precious","predator",
  "pregnant","prepared","presence","preserve","pressing","pressure","prestige",
  "presumed","pretense","previous","princess","printing","prisoner","probably",
  "proceeds","produced","producer","profound","promised","promptly","properly",
  "proposal","proposed","prospect","protocol","provoked","prudence","publicly",
  "punished","purchase","pursuing","puzzling","quadrant","quantity","quarters",
  "quickest","railroad","ranching","randomly","rational","readable","realized",
  "reasoned","rebelled","received","receiver","recently","reckless","recorded",
  "recovery","redesign","reducing","referral","referred","regarded","regional",
  "register","regulate","rejected","relating","relation","relative","released",
  "relevant","reliable","relieved","reliance","religion","remained","reminder",
  "renowned","repeated","replaced","reported","reporter","republic","required",
  "reserved","resident","resigned","resolved","resource","restored","restrain",
  "retailer","retained","retiring","retrieve","returned","revealed","reviewer",
  "revision","reviving","rewarded","rigorous","romantic","ruthless","sabotage",
  "sanction","scanning","scenario","schedule","scramble","scrutiny","seasonal",
  "secondly","selected","semester","sensible","separate","sequence","serenity",
  "sergeant","settling","severely","shifting","shipping","shooting","shortage",
  "showdown","shutdown","sideways","signaled","silenced","simulate","singular",
  "skeleton","sleeping","slipping","smallest","smashing","snapshot","societal",
  "softened","solitary","somebody","somewhat","southern","spanning","speaking",
  "specials","specimen","spending","spinning","splendid","sporting","spotting",
  "sprinkle","squarely","squeezing","stability","staffing","stagnant","standing",
  "startled","starting","statutes","stealing","steering","stepping","sticking",
  "stirring","stopping","straight","stranger","striking","strongly","struggle",
  "stunning","suburban","succeeds","succinctly","suddenly","suffered","suitable",
  "summoned","superior","supplant","supplied","supplier","suppress","surgical",
  "surprise","surround","survival","suspense","swimming","symbolic","sympathy",
  "syndrome","tactical","tailored","tangible","taxpayer","teaching","teammate",
  "tendency","terminal","terrible","terrific","tertiary","textbook","thankful",
  "theology","theorist","thinking","thirteen","thorough","thousand","threaten",
  "thriller","thriving","tickling","tightest","timeline","tolerant","tomorrow",
  "touching","tracking","trailing","treating","trillion","troubled","tutorial",
  "twisting","ultimate","umbrella","unbiased","underway","universe","unlocked",
  "unlikely","unmarked","unsigned","unstable","updating","upheaval","uprising",
  "upstream","urgently","utilized","vacation","validate","validity","valuably",
  "variable","vanished","velocity","vendetta","ventured","verified","vertical",
  "vicinity","viewable","violated","violence","Virginia","virtuous","visiting",
  "visually","volatile","volcanic","volition","vocation","voicedly","weakness",
  "wearable","weighing","welcomed","whenever","wherever","whisking","widening",
  "wildfire","wildness","windmill","wireless","withdrew","woodland","workshop",
  "wrapping","yearbook","yearning","yielding","youthful","zealotry","zeppelin",
] as const;

const WORD_SET: ReadonlySet<string> = new Set(
  WORD_LIST.map((w) => w.toLowerCase()).filter((w) => /^[a-z]{3,8}$/.test(w))
);

// --------------- State ---------------

function defaultState(): GameState {
  return {
    bananas: 0,
    totalLetters: 0,
    clickPower: 1,
    upgrades: { monkey: 0, typewriter: 0, training: 0, quill: 0 },
    wordBuffer: "",
    recentWords: [],
    wordCounts: {},
    totalWordsFound: 0,
    lastSaveTime: Date.now(),
  };
}

let state: GameState = defaultState();

// Display buffer for the typewriter output (not persisted)
let displayBuffer = "";

// --------------- Derived Values ---------------

function getUpgradeCost(id: UpgradeId): number {
  const def = UPGRADE_DEFS[id];
  return Math.floor(def.baseCost * Math.pow(def.costMultiplier, state.upgrades[id]));
}

function getLettersPerSecond(): number {
  let baseLps = 0;
  const ids = Object.keys(UPGRADE_DEFS) as UpgradeId[];
  for (const id of ids) {
    baseLps += UPGRADE_DEFS[id].lpsAdd * state.upgrades[id];
  }

  let multiplier = 1;
  for (const id of ids) {
    if (UPGRADE_DEFS[id].lpsMultiplier > 1 && state.upgrades[id] > 0) {
      multiplier *= Math.pow(UPGRADE_DEFS[id].lpsMultiplier, state.upgrades[id]);
    }
  }

  return baseLps * multiplier;
}

// --------------- DOM References ---------------

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

const dom = {
  bananas: () => getElement("bananas"),
  lps: () => getElement("lps"),
  totalLetters: () => getElement("total-letters"),
  totalWords: () => getElement("total-words"),
  typewriterOutput: () => getElement("typewriter-output"),
  currentBuffer: () => getElement("current-buffer"),
  clickBtn: () => getElement("click-btn"),
  recentWordsList: () => getElement("recent-words-list"),
  mostCommonWord: () => getElement("most-common-word"),
  uniqueWordsCount: () => getElement("unique-words-count"),
  offlineModal: () => getElement("offline-modal"),
  offlineEarnings: () => getElement("offline-earnings"),
  offlineClose: () => getElement("offline-close"),
  saveBtn: () => getElement("save-btn"),
  resetBtn: () => getElement("reset-btn"),
};

// --------------- Formatting ---------------

function formatNumber(n: number): string {
  if (n < 1_000) return Math.floor(n).toString();
  if (n < 1_000_000) return (n / 1_000).toFixed(1) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n < 1_000_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n < 1e15) return (n / 1e12).toFixed(2) + "T";
  if (n < 1e18) return (n / 1e15).toFixed(2) + "Qa";
  if (n < 1e21) return (n / 1e18).toFixed(2) + "Qi";
  if (n < 1e24) return (n / 1e21).toFixed(2) + "Sx";
  if (n < 1e27) return (n / 1e24).toFixed(2) + "Sp";
  if (n < 1e30) return (n / 1e27).toFixed(2) + "Oc";
  if (n < 1e33) return (n / 1e30).toFixed(2) + "No";
  return (n / 1e33).toFixed(2) + "Dc";
}

// --------------- Rendering ---------------

function renderStats(): void {
  dom.bananas().textContent = formatNumber(state.bananas);
  dom.lps().textContent = formatNumber(getLettersPerSecond());
  dom.totalLetters().textContent = formatNumber(state.totalLetters);
  dom.totalWords().textContent = formatNumber(state.totalWordsFound);
}

function renderUpgrades(): void {
  const ids = Object.keys(UPGRADE_DEFS) as UpgradeId[];
  for (const id of ids) {
    const costEl = document.getElementById(`cost-${id}`);
    const ownedEl = document.getElementById(`owned-${id}`);
    const btn = document.querySelector(`[data-upgrade="${id}"]`) as HTMLButtonElement | null;

    if (costEl) costEl.textContent = formatNumber(getUpgradeCost(id));
    if (ownedEl) ownedEl.textContent = state.upgrades[id].toString();
    if (btn) btn.disabled = state.bananas < getUpgradeCost(id);
  }
}

function renderTypewriter(): void {
  const output = dom.typewriterOutput();
  output.textContent = displayBuffer.slice(-200);
  output.scrollTop = output.scrollHeight;

  dom.currentBuffer().textContent = state.wordBuffer || "(empty)";
}

function renderWordDiscovery(): void {
  // Recent words
  const list = dom.recentWordsList();
  list.innerHTML = "";
  for (const word of state.recentWords) {
    const div = document.createElement("div");
    div.className = "word-entry";
    const bonus = word.length * word.length;
    div.textContent = `"${word}" (+${bonus} 🍌)`;
    list.appendChild(div);
  }

  // Most common word
  const common = dom.mostCommonWord();
  let bestWord = "";
  let bestCount = 0;
  for (const [word, count] of Object.entries(state.wordCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestWord = word;
    }
  }
  common.textContent = bestWord
    ? `"${bestWord}" (×${bestCount})`
    : "None yet";

  // Unique words count
  dom.uniqueWordsCount().textContent = Object.keys(state.wordCounts).length.toString();
}

function renderAll(): void {
  renderStats();
  renderUpgrades();
  renderTypewriter();
  renderWordDiscovery();
}

// --------------- Game Logic ---------------

function checkForWord(): void {
  const buf = state.wordBuffer;
  for (let len = Math.min(buf.length, MAX_WORD_LENGTH); len >= MIN_WORD_LENGTH; len--) {
    const candidate = buf.slice(-len);
    if (WORD_SET.has(candidate)) {
      const bonus = len * len;
      state.bananas += bonus;

      state.totalWordsFound++;
      state.wordCounts[candidate] = (state.wordCounts[candidate] || 0) + 1;
      state.recentWords.unshift(candidate);
      if (state.recentWords.length > 10) {
        state.recentWords.pop();
      }

      state.wordBuffer = "";
      return;
    }
  }
}

function generateCharacters(amount: number): void {
  const chars = Math.floor(amount);
  if (chars <= 0) return;

  state.bananas += chars;
  state.totalLetters += chars;

  for (let i = 0; i < chars; i++) {
    const char = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    state.wordBuffer += char;
    displayBuffer += char;

    checkForWord();

    if (state.wordBuffer.length > MAX_WORD_LENGTH) {
      state.wordBuffer = state.wordBuffer.slice(-MAX_WORD_LENGTH);
    }
  }

  // Keep display buffer from growing unbounded
  if (displayBuffer.length > 500) {
    displayBuffer = displayBuffer.slice(-500);
  }
}

function handleClick(): void {
  generateCharacters(state.clickPower);
  renderAll();
}

function purchaseUpgrade(id: UpgradeId): void {
  const cost = getUpgradeCost(id);
  if (state.bananas >= cost) {
    state.bananas -= cost;
    state.upgrades[id]++;
    renderAll();
  }
}

// --------------- Save / Load ---------------

function saveGame(): void {
  state.lastSaveTime = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage might be full or unavailable; silently fail
  }
}

function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;

    // Merge with defaults to handle missing fields from older saves
    const merged: GameState = { ...defaultState(), ...parsed };
    merged.upgrades = { ...defaultState().upgrades, ...(parsed.upgrades ?? {}) };
    if (!Array.isArray(merged.recentWords)) merged.recentWords = [];
    if (typeof merged.wordCounts !== "object" || merged.wordCounts === null) merged.wordCounts = {};
    if (typeof merged.wordBuffer !== "string") merged.wordBuffer = "";
    if (typeof merged.totalWordsFound !== "number") merged.totalWordsFound = 0;
    return merged;
  } catch {
    return null;
  }
}

function resetGame(): void {
  if (confirm("Are you sure you want to reset all progress?")) {
    localStorage.removeItem(SAVE_KEY);
    state = defaultState();
    displayBuffer = "";
    renderAll();
  }
}

function handleOfflineProgress(): void {
  const now = Date.now();
  const elapsed = (now - state.lastSaveTime) / 1000;
  if (elapsed < 10) return;

  const lps = getLettersPerSecond();
  if (lps <= 0) return;

  const offlineChars = Math.floor(lps * elapsed);
  if (offlineChars > 0) {
    // Just award bananas, no word detection for offline
    state.bananas += offlineChars;
    state.totalLetters += offlineChars;

    dom.offlineEarnings().textContent = formatNumber(offlineChars);
    dom.offlineModal().classList.remove("hidden");
  }
}

// --------------- Game Loop ---------------

function gameTick(): void {
  const lps = getLettersPerSecond();
  const charsThisTick = lps / (1000 / TICK_INTERVAL_MS);

  if (charsThisTick > 0) {
    generateCharacters(charsThisTick);
  }

  renderStats();
  renderUpgrades();
  renderTypewriter();
}

// --------------- Initialization ---------------

function init(): void {
  // Load saved state
  const saved = loadGame();
  if (saved) {
    state = saved;
    handleOfflineProgress();
  }

  renderAll();

  // Click button
  dom.clickBtn().addEventListener("click", handleClick);

  // Upgrade buttons
  const upgradeButtons = document.querySelectorAll<HTMLButtonElement>(".upgrade-btn");
  upgradeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.upgrade as UpgradeId;
      if (id) purchaseUpgrade(id);
    });
  });

  // Modal close
  dom.offlineClose().addEventListener("click", () => {
    dom.offlineModal().classList.add("hidden");
  });

  // Save / Reset
  dom.saveBtn().addEventListener("click", saveGame);
  dom.resetBtn().addEventListener("click", resetGame);

  // Game loop
  setInterval(gameTick, TICK_INTERVAL_MS);

  // Auto-save
  setInterval(saveGame, AUTO_SAVE_INTERVAL_MS);

  // Save on page unload
  window.addEventListener("beforeunload", saveGame);
}

// Start the game when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
