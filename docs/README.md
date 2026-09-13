# 読み解く 개발·운영 문서

이 디렉터리는 현재 구현과 운영 기준을 설명한다. 과거의 정적 시안 전환 계획이 아니라, 로그인 이후 학습 흐름·관리자 운영·배포·QA를 기준으로 유지한다.

| 문서 | 용도 |
| --- | --- |
| [01-ui-and-flow-spec.md](./01-ui-and-flow-spec.md) | 학습자·관리자 화면, 다국어, 모바일 UX와 상태 전이 |
| [02-data-and-api-spec.md](./02-data-and-api-spec.md) | 현재 데이터 모델, 인증, 주요 API 계약과 집계 규칙 |
| [03-ai-operations-and-react-plan.md](./03-ai-operations-and-react-plan.md) | AI 생성 워커·검증·비용 기록과 프론트엔드 구조 |
| [04-acceptance-checklist.md](./04-acceptance-checklist.md) | 실제 기기 기준 QA 체크리스트와 자동 검증 명령 |
| [05-delivery-roadmap.md](./05-delivery-roadmap.md) | 현재 운영 단계와 이후 개선 원칙 |
| [06-production-deployment.md](./06-production-deployment.md) | Linux, Docker Compose, Caddy 운영 배포·갱신·복구 절차 |

## 유지 원칙

- API 또는 DB 구조를 바꾸면 [02](./02-data-and-api-spec.md)와 [04](./04-acceptance-checklist.md)를 함께 검토한다.
- 화면 동작·문구·접근성·반응형 레이아웃을 바꾸면 [01](./01-ui-and-flow-spec.md)과 QA 항목을 함께 갱신한다.
- AI 모델·프롬프트·재시도 정책을 바꾸면 [03](./03-ai-operations-and-react-plan.md)와 운영 환경 변수 설명을 함께 갱신한다.
- 운영 명령은 실제 `deploy/` Compose 파일과 `.env.production`을 기준으로 작성한다. 서버 고유 포트나 비밀값은 문서에 고정하지 않는다.
