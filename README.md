# 🛒 Split Súper

App para dividir los gastos del supermercado entre varias personas **según lo que compró cada una**, no en partes iguales.

Ideal para cuando conviven varias personas, hacen las compras juntos y **pagan todo con una sola tarjeta**, pero cada uno quiere saber cuánto gastó realmente y cuánto le debe a quien puso la tarjeta.

- ✅ Cada uno carga sus propios gastos (leche, shampoo, lo que sea).
- ✅ Se ve el total de cada persona y el total del mes.
- ✅ Se elige quién pagó con la tarjeta y la app calcula **cuánto le debe cada uno**.
- ✅ **Sincronización en tiempo real**: los 4 (o los que sean) ven lo mismo desde sus celulares.
- ✅ Se organiza por **mes**.
- ✅ Web pura (HTML/CSS/JS), se publica **gratis** en GitHub Pages.

---

## 🚀 Puesta en marcha (una sola vez)

La app guarda los gastos en **Firebase Firestore** (base de datos gratis de Google) para que todos vean lo mismo en tiempo real. Necesitás crear un proyecto de Firebase gratuito y pegar sus claves. Son ~5 minutos.

### 1. Configurar Firebase

1. Entrá a <https://console.firebase.google.com/> e iniciá sesión con tu cuenta de Google.
2. Tocá **"Agregar proyecto"** (Add project). Ponele un nombre (ej: `split-super`). Podés desactivar Google Analytics. Creá el proyecto.
3. Ya dentro del proyecto, en el menú izquierdo andá a **Build → Firestore Database** y tocá **"Crear base de datos"** (Create database).
   - Elegí ubicación (cualquiera cercana).
   - Empezá en **"modo de prueba"** (test mode) por ahora. *(Ver nota de seguridad más abajo.)*
4. Ahora registrá la app web: tocá el ícono **`</>`** (Web) en la pantalla principal del proyecto (o **Configuración del proyecto → Tus apps → Web**).
   - Ponele un apodo (ej: `split-super-web`) y registrala.
   - Firebase te va a mostrar un objeto `firebaseConfig` con tus claves. **Copialas.**
5. Abrí el archivo [`firebase-config.js`](./firebase-config.js) de este repo y pegá tus valores reemplazando los `TU_...`:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza....",
     authDomain: "split-super-xxxx.firebaseapp.com",
     projectId: "split-super-xxxx",
     storageBucket: "split-super-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef...",
   };
   ```

   > Estas claves son **públicas por diseño** (así funcionan las apps web de Firebase). No son un secreto; la seguridad se maneja con las Reglas de Firestore.

6. Guardá y subí el cambio (commit + push).

### 2. Publicar la app en GitHub Pages (gratis)

1. En este repo, andá a **Settings → Pages**.
2. En **"Source"** elegí **Deploy from a branch**.
3. Branch: `main` (o la que uses) y carpeta `/ (root)`. Guardá.
4. En un minuto vas a tener una URL tipo `https://TU_USUARIO.github.io/split-super/`.
5. Compartí esa URL con tus compañeros. ¡Listo! Cada uno la abre en su celular y carga sus gastos.

> 💡 Tip: en el celular, "Agregar a pantalla de inicio" para que quede como una app.

---

## 🧑‍🤝‍🧑 Cómo se usa

1. Elegí el **mes** arriba.
2. En **Agregar gasto**: elegí de quién es, la descripción y el monto → **Agregar**.
3. En **Resumen del mes** ves cuánto lleva gastado cada uno y el total.
4. Elegí en **"Pagó con la tarjeta"** quién puso la tarjeta ese mes: la app muestra cuánto le debe cada uno.
5. Tocá **"Editar nombres"** para poner los nombres reales de las personas.

Todo se sincroniza solo entre todos los que tengan la app abierta.

---

## 🔒 Nota de seguridad (importante)

Al crear Firestore en **modo de prueba**, cualquiera con las claves podría leer/escribir durante ~30 días. Para uso entre amigos suele alcanzar, pero para dejarlo seguro tenés dos opciones:

- **Opción simple (recomendada para empezar):** dejalo en modo prueba y renová cuando avise. Los datos no son sensibles (gastos de súper).
- **Opción más segura:** activar autenticación (por ej. login anónimo o con Google) y poner reglas que solo permitan a usuarios autenticados. Si querés, pedíme que te agregue el login.

Reglas de ejemplo (modo prueba, funciona ya):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // ⚠️ abierto — cambiar para producción
    }
  }
}
```

---

## 🧩 Estructura del proyecto

```
index.html          Estructura de la página
styles.css          Estilos (tema oscuro, responsive)
app.js              Lógica + conexión a Firestore
firebase-config.js  Tus claves de Firebase (editar esto)
```

## 🛠️ Modelo de datos (Firestore)

- Colección `expenses`: `{ month, person, description, amount, createdAt }`
- Documento `config/app`: `{ people: [...] }` — nombres de las personas.
- Documento `months/{YYYY-MM}`: `{ paidBy }` — quién pagó con la tarjeta ese mes.

---

Hecho con ❤️ para que nadie pague de más.
