// Configuração do Firebase (login Google + banco de dados na nuvem).
// Esses valores NÃO são segredo: quem protege os dados são as regras do Firestore
// (firestore.rules) e a lista de e-mails autorizados. Veja CONFIGURAR.md.
//
// Enquanto estiver "null", o app funciona em modo local (dados só neste aparelho).
window.FIREBASE_CONFIG = null;

// Exemplo de como fica depois de preenchido:
// window.FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "meu-projeto.firebaseapp.com",
//   projectId: "meu-projeto",
//   storageBucket: "meu-projeto.appspot.com",
//   messagingSenderId: "123456789",
//   appId: "1:123456789:web:abc123",
// };
