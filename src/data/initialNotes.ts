import { Note } from '../types';

export const INITIAL_NOTES: Note[] = [
  {
    id: 'note-algo-risk-v1',
    title: '알고리즘 트레이딩 리스크 관리: 변동성 기반 동적 포지션 사이징',
    date: '2026-07-12',
    createdAt: '2026-07-12T10:30:00.000Z',
    updatedAt: '2026-07-12T10:30:00.000Z',
    content: `# 알고리즘 트레이딩 리스크 관리: 변동성 기반 동적 포지션 사이징

## 핵심 가설
시장 국면의 변동성(ATR)이 확대될 때는 기대 수익률과 관계없이 포지션 규모를 즉시 축소해야 장기 생존이 보장된다.

### 상세 규칙
1. **켈리 공식(Kelly Criterion)의 반감기 적용**:
   - 이론적 풀 켈리는 과도한 파산 위험을 내포하므로 Fractional Kelly (0.3x)를 기본 상한으로 설정.
2. **ATR(Average True Range) 필터링**:
   - 14일 ATR이 30일 평균 대비 1.5배 이상 상승 시 모든 신규 진입 포지션 크기를 기본의 50%로 강제 감축.
3. **고정 손절(Fixed Stop) 지양**:
   - 틱 단위 고정 손절은 변동성 노이즈에 걸릴 확률이 높으므로, Chandelier Exit 형태의 변동성 추적 손절선 적용.

### 핵심 결론
- "장기적인 복리 수익은 승률이 아니라 치명적인 드로다운(MDD) 방어율에 의해 결정된다."`,
    summary: '변동성(ATR) 확대 시 포지션을 동적으로 축소하고 Fractional Kelly를 적용하여 치명적 파산을 방지하는 리스크 관리 프레임워크.',
    entities: ['알고리즘 트레이딩', '리스크 관리', 'ATR', '켈리 공식', '드로다운(MDD)', '포지션 사이징'],
    claims: [
      '변동성 급증 구간에서는 기대 수익률보다 자본 보존이 절대적으로 우선되어야 한다.',
      '고정 손절선보다 변동성 연동 추적 손절이 노이즈 필터링에 우수하다.'
    ],
    openQuestions: [
      '플래시 크래시 상황에서 호가창 유동성 공백 시 ATR 지표의 계산 지연을 어떻게 극복할 것인가?'
    ],
    intent: 'methodology_framework',
    approvedRelations: [
      {
        id: 'rel-1',
        sourceNoteId: 'note-algo-risk-v1',
        targetNoteId: 'note-algo-momentum',
        targetTitle: '고빈도 및 모멘텀 전략: 확실한 알파 구간에서의 레버리지 극대화',
        relationType: 'CONTRAST',
        explanation: '리스크 보수주의와 단기 알파 수익 극대화 간의 전략적 대조',
        status: 'approved'
      }
    ],
    suggestedRelations: []
  },
  {
    id: 'note-algo-momentum',
    title: '고빈도 및 모멘텀 전략: 확실한 알파 구간에서의 레버리지 극대화',
    date: '2026-07-28',
    createdAt: '2026-07-28T14:15:00.000Z',
    updatedAt: '2026-07-28T14:15:00.000Z',
    content: `# 고빈도 및 모멘텀 전략: 확실한 알파 구간에서의 레버리지 극대화

## 문제 제기
변동성이 커진다고 무조건 포지션을 줄이면, 강력한 추세 모멘텀 구간에서 발생하는 가장 큰 수익 기회를 놓치게 된다.

### 전략적 주장
- 과거 백테스트 결과, 승률 65% 이상으로 검증된 돌파 신호(Breakout Signal) 발생 시에는 일시적으로 2.5~3배 레버리지를 가동해야 샤프 지수가 상승함.
- 과도한 분산과 방어적 포지션 사이징은 알파(Alpha)를 희석시킬 뿐이다.
- 손절은 호가창 매수 잔량 붕괴 시 즉각적인 시장가 청산으로 대응하면 충분하다.

### 주의 사항
- 급격한 역추세 갭하락 시 미체결 위험 존재.`,
    summary: '높은 확신의 모멘텀 돌파 구간에서는 과도한 방어적 사이징 대신 단기 레버리지를 공격적으로 활용하여 알파를 극대화해야 한다는 실험적 주장.',
    entities: ['모멘텀 전략', '레버리지', '알파', '샤프 지수', '돌파 매매'],
    claims: [
      '확실한 모멘텀 구간에서 리스크 축소는 치명적인 기회비용을 유발한다.',
      '승률 65% 이상 구간에서는 단기 레버리지 극대화가 장기 샤프 지수를 끌어올린다.'
    ],
    openQuestions: [
      '시장가 청산 시 발생하는 슬리피지(Slippage) 누적액이 레버리지 초과수익을 잠식하지 않는가?'
    ],
    intent: 'strategic_hypothesis',
    approvedRelations: [
      {
        id: 'rel-2',
        sourceNoteId: 'note-algo-momentum',
        targetNoteId: 'note-algo-retrospective',
        targetTitle: '알고리즘 트레이딩 리스크 관리: 회고 및 모델 전환 (관점 변화)',
        relationType: 'CONTRADICTION',
        explanation: '8월 실전 드로다운 이후 레버리지 극대화 가설의 오류 확인 및 폐기',
        status: 'approved'
      }
    ],
    suggestedRelations: []
  },
  {
    id: 'note-algo-retrospective',
    title: '알고리즘 트레이딩 리스크 관리: 회고 및 모델 전환 (관점 변화)',
    date: '2026-08-25',
    createdAt: '2026-08-25T19:00:00.000Z',
    updatedAt: '2026-08-25T19:00:00.000Z',
    content: `# 알고리즘 트레이딩 리스크 관리: 회고 및 모델 전환 (관점 변화)

## 8월 실전 운용 회고 및 생각의 전환
8월 5일 글로벌 유동성 경색 장세에서 7월 말 시도했던 '모멘텀 레버리지 극대화 전략'이 계좌 MDD -14.2%를 유발했다.

### 과거 관점과의 결별
1. **7월 말 가설 폐기**:
   - 아무리 승률이 높은 모멘텀이라도 비유동성 꼬리 위험(Tail Risk) 앞에서는 레버리지가 파멸의 지름길임을 실전에서 뼈저리게 확인했다.
2. **7월 초 원칙의 재확인과 진화**:
   - 7월 12일 메모했던 '변동성 기반 동적 포지션 축소' 원칙이 맞았다.
   - 그러나 단순 ATR 지표만으로는 부족했다. 실제 슬리피지는 호가창 불균형(Order Book Imbalance)에서 발생했기 때문이다.
3. **새로운 융합 모델**:
   - ATR 지표 + 호가창 매수/매도 잔량 비율(OIB)을 곱한 "복합 유동성 리스크 계수"를 산출하여 포지션 상한을 자동 강제.

### 결론 요약
"트레이딩에서 알파 탐색보다 우선하는 것은 시스템의 생존 역학이다. 레버리지에 대한 나의 낙관론은 명백한 오류였다."`,
    summary: '8월 실전 드로다운 경험을 바탕으로 7월 말의 레버리지 가설을 전면 폐기하고, 7월 초의 리스크 관리 원칙에 오더북 불균형을 결합한 진화된 생존 모델 채택.',
    entities: ['회고', '관점 변화', 'MDD', '호가창 불균형(OIB)', '꼬리 위험(Tail Risk)', '생존 역학'],
    claims: [
      '확률적 승률에 기반한 레버리지 확대는 꼬리 위험 앞에서 무력하다.',
      '단순 가격 변동성(ATR) 외에 미시구조 유동성(Order Book Imbalance)이 리스크 모델에 필수적이다.'
    ],
    openQuestions: [
      '실시간 웹소켓 오더북 틱 데이터를 저지연으로 처리하면서 메모리 오버헤드를 줄이는 아키텍처는 무엇인가?'
    ],
    intent: 'retrospective_reflection',
    approvedRelations: [
      {
        id: 'rel-3',
        sourceNoteId: 'note-algo-retrospective',
        targetNoteId: 'note-algo-risk-v1',
        targetTitle: '알고리즘 트레이딩 리스크 관리: 변동성 기반 동적 포지션 사이징',
        relationType: 'EXTENSION',
        explanation: '7월 초의 ATR 모델을 오더북 불균형 계수와 결합하여 심화 발전',
        status: 'approved'
      }
    ],
    suggestedRelations: []
  },
  {
    id: 'note-ai-agent-memory',
    title: 'LLM 자율 에이전트의 다층 메모리 아키텍처와 시맨틱 지식 그래프',
    date: '2026-08-10',
    createdAt: '2026-08-10T11:20:00.000Z',
    updatedAt: '2026-08-10T11:20:00.000Z',
    content: `# LLM 자율 에이전트의 다층 메모리 아키텍처와 시맨틱 지식 그래프

## 배경
단순한 RAG(단락 임베딩 검색)는 문맥적 파편화(Chunking Fragmentation)로 인해 장기 인과관계나 모순을 추론하지 못한다.

### 제안 구조
1. **작동 메모리 (Working Memory)**:
   - 현재 대화 세션 및 실시간 활성 버퍼 (Context Window).
2. **에피소딕 메모리 (Episodic Memory)**:
   - 사건의 시간적 순서와 타임스탬프가 보존된 경험 로그.
3. **의미적 지식 그래프 (Semantic Knowledge Graph)**:
   - 개념과 주장 간의 관계 타입(인과, 모순, 확장)이 레이블링된 네트워크.

### 핵심 아이디어
- 메모리는 단순 저장이 아니라 "망각(Pruning)"과 "통합(Consolidation)" 에이전트가 주기적으로 백그라운드에서 동작해야 인간 지능처럼 진화한다.`,
    summary: '단순 벡터 RAG의 한계를 극복하기 위해 에피소딕 타임라인과 시맨틱 관계 라벨 그래프를 결합한 자율 에이전트 메모리 아키텍처 설계.',
    entities: ['LLM 에이전트', '메모리 계층', '지식 그래프', '에피소딕 메모리', '지식 통합(Consolidation)'],
    claims: [
      '단순 벡터 임베딩 검색만으로는 시간 순서와 논리적 인과관계를 보존할 수 없다.',
      '지식 그래프의 엣지에는 단순 연결선이 아닌 관계 유형(인과, 모순, 확장)이 명시되어야 한다.'
    ],
    openQuestions: [
      '에이전트가 지식을 자동 통합할 때 발생하는 환각(Hallucination)을 어떻게 결정론적으로 검증할 것인가?'
    ],
    intent: 'conceptual_definition',
    approvedRelations: [
      {
        id: 'rel-4',
        sourceNoteId: 'note-ai-agent-memory',
        targetNoteId: 'note-pkm-philosophy',
        targetTitle: 'AI 네이티브 PKM 시스템의 철학: 저장(Storage)에서 이해(Understanding)로',
        relationType: 'PREREQUISITE',
        explanation: '개인 지식 관리에 필요한 기술적 에이전트 메모리 기반 구조 제공',
        status: 'approved'
      }
    ],
    suggestedRelations: []
  },
  {
    id: 'note-pkm-philosophy',
    title: 'AI 네이티브 PKM 시스템의 철학: 저장(Storage)에서 이해(Understanding)로',
    date: '2026-08-18',
    createdAt: '2026-08-18T16:00:00.000Z',
    updatedAt: '2026-08-18T16:00:00.000Z',
    content: `# AI 네이티브 PKM 시스템의 철학: 저장(Storage)에서 이해(Understanding)로

## 옵시디언(Obsidian)의 한계와 새로운 패러다임
Obsidian을 비롯한 2세대 지식관리 도구는 훌륭하지만 '수동 작업의 피로'와 '죽은 지식(Dead Knowledge)'의 문제를 벗어나지 못한다.

### 핵심 패러다임 전환
1. **링크의 주체 변화**:
   - 사용자가 [[위키링크]]를 일일이 고민할 필요 없이, 시스템이 작성 중인 텍스트의 임베딩을 분석해 연결을 추천하고 사용자는 승인만 한다.
2. **그래프 뷰의 혁신**:
   - 단순한 실선 그물망이 아니라, "A는 B의 원인이다", "C는 D와 상충된다"는 논리적 엣지 라벨을 제공.
3. **회상의 자연화**:
   - 키워드 검색 대신 "지난달 리스크 관리에 대해 내가 뭐라고 적었지?", "내 생각이 바뀐 지점이 어디지?" 같은 대화형 메타 질의 지원.
4. **능동적 에이전트**:
   - 잊혀진 메모와 상충되는 생각을 에이전트가 먼저 발견해 정리와 종합(Synthesis)을 권유.`,
    summary: '수동 링크와 키워드 검색의 한계를 넘어, 자동 임베딩, 의미적 관계 그래프, 대화형 회상 및 자율 정리 에이전트를 갖춘 차세대 AI 네이티브 PKM 설계 철학.',
    entities: ['PKM', '옵시디언(Obsidian)', '지식 이해', '대화형 회상', '능동적 에이전트', '의미적 그래프'],
    claims: [
      '지식 도구의 본질은 저장이 아니라 문맥적 이해와 필요 시점의 자연스러운 회상이다.',
      '수동 링크 생성은 사용자의 인지 부하를 높여 도구 사용을 중도 포기하게 만든다.'
    ],
    openQuestions: [
      '로컬 우선(Local-first) 프라이버시를 지키면서 고성능 임베딩 및 추론 속도를 모바일/웹에서 유지하는 최적 경계선은 어디인가?'
    ],
    intent: 'conceptual_definition',
    approvedRelations: [
      {
        id: 'rel-5',
        sourceNoteId: 'note-pkm-philosophy',
        targetNoteId: 'note-local-first',
        targetTitle: '로컬 우선(Local-First) 아키텍처와 사용자 데이터 주권',
        relationType: 'EXTENSION',
        explanation: '개인 프라이버시 및 데이터 주권 보장을 위한 로컬 우선 설계 확장',
        status: 'approved'
      }
    ],
    suggestedRelations: []
  },
  {
    id: 'note-local-first',
    title: '로컬 우선(Local-First) 아키텍처와 사용자 데이터 주권',
    date: '2026-07-05',
    createdAt: '2026-07-05T09:00:00.000Z',
    updatedAt: '2026-07-05T09:00:00.000Z',
    content: `# 로컬 우선(Local-First) 아키텍처와 사용자 데이터 주권

## 개요
개인의 생각과 비밀스러운 지식은 타사의 중앙 집중식 클라우드 데이터베이스에 평문으로 상시 저장되어서는 안 된다.

### 기본 설계 원칙
1. **클라이언트 주권**:
   - 모든 마크다운 원문과 벡터 캐시는 브라우저의 IndexedDB 또는 로컬 파일 시스템에 저장.
2. **필요 시점 호출(Just-in-Time Inference)**:
   - LLM 임베딩 및 메타데이터 추출 시점에만 특정 메모 청크를 전송하고, 서버에 영구 보관하지 않음.
3. **오프라인 동작 가능성**:
   - 네트워크 연결이 없어도 로컬 인메모리 코사인 유사도 검색과 편집이 100% 동작해야 함.`,
    summary: '개인 지식의 원본을 브라우저 로컬(IndexedDB)에 격리하고, AI 추론 시에만 최소한의 컨텍스트를 전송하여 데이터 주권을 완벽히 보호하는 아키텍처.',
    entities: ['로컬 우선(Local-First)', '데이터 주권', 'IndexedDB', '프라이버시', '오프라인 우선'],
    claims: [
      '개인 지식 베이스의 원문은 제3자 클라우드에 영구 보관되지 않아야 한다.',
      '오프라인 상태에서도 인메모리 벡터 연산과 마크다운 편집이 가능해야 한다.'
    ],
    openQuestions: [
      '대규모(10만 개 이상) 개인 노트 베이스에서 브라우저 WebAssembly 기반 벡터 인덱스의 메모리 한계는 얼마인가?'
    ],
    intent: 'methodology_framework',
    approvedRelations: [],
    suggestedRelations: []
  }
];
