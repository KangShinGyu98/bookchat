# BookChat - 독서 토론 웹사이트

1인 개발 독서토론 웹사이트입니다.

**사이트 주소:** https://book-chat-da2d6.web.app/index.html

## 기술 스택

- **프론트엔드:** JavaScript, Bootstrap 5.3
- **백엔드:** Firebase (Firestore, Realtime Database, Cloud Functions, Authentication)
- **검색:** Algolia InstantSearch
- **외부 API:** 네이버 도서 API
- **배포:** Firebase Hosting

## 주요 기능

- 도서 검색 및 추가 (네이버 도서 API 연동)
- 도서별 토론 질문 작성 (사용자당 최대 3개)
- 실시간 채팅
- 도서 구독 및 별점 평가
- 소셜 로그인 (Google, 네이버)
- 실시간 알림 시스템
- 날짜별 전체 채팅방

## 프로젝트 구조

```
bookchat/
├── functions/             # Firebase Cloud Functions
├── public/                # 메인 프론트엔드
│   ├── index.html         # 도서 목록 페이지
│   ├── chat.html          # 도서 토론방
│   └── js/                # JavaScript 모듈
├── firestore.rules        # Firestore 보안 규칙
├── database.rules.json    # Realtime Database 규칙
└── firebase.json          # Firebase 설정
```
