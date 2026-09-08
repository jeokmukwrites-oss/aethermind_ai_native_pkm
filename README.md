# AetherMind — AI Native PKM

옵시디언을 넘어서는 AI 네이티브 개인 지식관리 시스템. 실시간 RAG 제안, 시맨틱 관계 그래프, 대화형 회상, 에이전틱 지식 정리, 그리고 **PC ↔ 안드로이드 기기 간 자동 동기화**를 지원합니다.

## 1. PC에서 실행하기

**요구사항:** Node.js 20+ (권장: 24), npm

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY 값을 자신의 키로 교체
npm run dev             # 개발 모드: http://localhost:3000
```

상시로 켜 둘 서버라면(폰과의 동기화 코디네이터 역할) 개발 모드보다 프로덕션 모드가 더 빠르고 안정적입니다:

```bash
npm run build && npm start   # 빌드 후 정적 서빙으로 실행
```

AI 기능(요약/시맨틱 분석/음성·이미지 캡처/대화형 회상)은 서버(`server.ts`)가 `GEMINI_API_KEY`를 이용해 Gemini API를 호출하는 방식입니다. 키가 없어도 앱은 동작하며, 이 경우 각 기능은 로컬 휴리스틱 폴백으로 동작합니다.

서버를 시작하면 콘솔에 `🔐 동기화 인증 토큰`이 출력됩니다 — 이 토큰이 없으면 어떤 기기도(PC 브라우저 자신 포함) `/api/*` 호출을 할 수 없습니다(같은 LAN의 아무나 노트를 읽고 쓰지 못하도록 하는 보호 장치). PC 브라우저와 폰 앱 양쪽 모두 **보관소 → 기기 간 동기화**에서 이 토큰을 한 번씩 입력해 저장해야 합니다. 토큰은 `data/sync-token` 파일에 저장되어 서버 재시작 후에도 유지되며(직접 고정하려면 `.env`에 `SYNC_TOKEN=...`), `data/`는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

## 2. 안드로이드 앱으로 실행하기

이 저장소는 [Capacitor](https://capacitorjs.com)로 안드로이드 앱을 빌드합니다. 앱 자체는 정적 SPA로 패키징되어 폰에 설치되고, AI 호출과 기기 간 동기화는 **PC에서 실행 중인 서버**를 통해 이루어집니다(폰에 API 키를 둘 필요가 없습니다).

**요구사항:** Android Studio 또는 Android SDK + JDK 17/21(풀 JDK, JRE만으로는 `javac`가 없어 빌드 실패), `ANDROID_HOME` 환경변수.

```bash
npm run build        # dist/ 생성
npx cap sync android  # dist/ → android 프로젝트에 반영
cd android
./gradlew assembleDebug   # android/app/build/outputs/apk/debug/*.apk
```

생성된 APK를 폰에 설치(`adb install ...`)하거나 Android Studio에서 `android/` 폴더를 열어 직접 실행/디버깅할 수 있습니다.

> 코드를 수정한 뒤에는 항상 `npm run build && npx cap sync android`를 다시 실행해야 APK에 최신 웹 코드가 반영됩니다.

## 3. PC ↔ 모바일 기기 동기화

1. PC에서 서버를 계속 실행해 둡니다(`npm start` 권장, 개발 중이면 `npm run dev`도 가능). 서버는 `0.0.0.0:3000`에서 리슨하므로 같은 Wi‑Fi(LAN)의 다른 기기에서 접근할 수 있습니다.
2. 서버 콘솔에 출력된 `🔐 동기화 인증 토큰`을 복사해 둡니다.
3. PC의 LAN IP를 확인합니다 (예: `192.168.0.10`).
4. 폰 앱과 PC 브라우저 양쪽에서 **보관소(Vault) 탭 → 기기 간 동기화** 섹션에 서버 주소(`http://192.168.0.10:3000`, PC 브라우저 자신은 비워도 됨)와 인증 토큰을 입력하고 저장합니다.
5. 이후 노트를 저장/삭제할 때마다 자동으로 백그라운드 동기화되며, 충돌은 최신 수정 시각(`updatedAt`) 기준으로 자동 해결됩니다.
6. 동기화 데이터는 PC의 `data/aethermind-sync.db`(SQLite)에만 저장됩니다 — 외부 클라우드로 전송되지 않습니다. 이 폴더는 `.gitignore`에 포함되어 있으니 커밋되지 않습니다.

같은 방식으로 PC 브라우저 자체(`http://localhost:3000`)도 동기화 대상 기기가 되므로, PC와 폰을 동시에 쓰는 워크플로가 자동으로 맞춰집니다.

### 문제 해결

- **"동기화 사용 불가"** 라고 뜨면: PC 서버가 켜져 있는지, 폰과 PC가 같은 네트워크에 있는지, 방화벽이 3000번 포트를 막고 있지 않은지 확인하세요.
- **"인증 토큰이 올바르지 않습니다"** 라고 뜨면: 서버 콘솔에 출력된 토큰과 앱에 입력한 토큰이 다릅니다. 서버를 재시작해도 `data/sync-token`에 저장된 토큰은 바뀌지 않으니 그대로 다시 복사해 넣으면 됩니다.
- 안드로이드는 기본적으로 평문(HTTP) 통신을 차단하므로, `AndroidManifest.xml`에 `android:usesCleartextTraffic="true"`가 설정되어 있습니다(로컬 LAN 전용 서버이므로 안전).

## 4. 주요 기능

| 영역 | 설명 |
| --- | --- |
| 캡처 | 텍스트/음성/이미지로 노트 작성, 실시간 AI 사이드바 제안 |
| 그래프 | 노트 간 시맨틱 관계를 d3 기반 그래프로 시각화 |
| 회상 | 노트를 근거로 인용하며 답하는 대화형 RAG 챗 |
| 정리 | 자율 에이전트가 모순/오래된 노트/종합 제안을 스캔 |
| 보관소 | 백업/복원, 통계, PC ↔ 모바일 기기 간 동기화 설정 |

## 5. 스택

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Express · Google Gemini API · Capacitor(Android) · IndexedDB(로컬 저장) · SQLite(동기화 서버) · vite-plugin-pwa
