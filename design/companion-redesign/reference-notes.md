# Notas de referencia: itero.gg (estudio de arquitectura de información)

Fuente: la página pública itero.gg (texto de portada y FAQ). No se pudieron ver capturas de la app en sí; solo el texto y los nombres de los recursos de la web.

## Qué aprendí
- La app se organiza por **fases de la partida**: cola/selección ("analiza ambos equipos, tu historial y tu pool"), equipos cerrados (análisis del enfrentamiento y macro), partida (overlays: temporizadores, oro del equipo, daño, orden de habilidades) y post partida (análisis de errores de macro).
- Lo primero que enseña es una **recomendación personalizada** (pick + build + runas), no una tabla de estadísticas. El pitch repetido es "100 % personalizado".
- Las runas y objetos se aplican **con un clic** al cliente; la explicación va en lenguaje de coach ("matchup tips", consejos por nivel), no solo en números.
- Alrededor hay herramientas sueltas (simulador de drafts, constructor de pool, estadísticas de campeón), separadas del flujo de la partida.
- La web insiste en "Fully Riot compliant" y en la voz de un coach IA.

## Lo que hago distinto
- No copio marca, nombre, paleta, composición ni textos. Identidad propia dentro de DraftGap: tres lenguajes visuales distintos (tinta + cítrico, papel + verde/coral, violeta noche + menta).
- La navegación es una **línea de fases** visible (Selección, Carga, Partida, Después) que siempre dice dónde está el usuario y qué se desbloquea después (S16: rivales solo desde la carga).
- Cada recomendación son **varias opciones comparables** con su evidencia (n.º de partidas, winrate), nunca una orden única (S8). El pick lo hace siempre el usuario.
- La explicación del LLM cita datos (22/30 partidas, +86,9) y se puede abrir o ignorar; no sustituye a la tabla.
- Sin overlays sobre el juego: es una ventana al lado del cliente; el chat de matchup y el scouting viven dentro de la misma ventana.
- Datos de ejemplo de este proyecto (Veigar medio 22/30; Garras del inmortal 50,22 % en 2308 partidas); el resto es ficticio y marcado como tal en pie de página.

# Dirección D · Pro: qué hace que parezca producto profesional

Fuente: tras la opinión "copia el estilo de itero.gg, algo más moderno y profesional, no tan IA". Vistas las capturas de producto públicas de itero.gg (`/images/home/drafting-suggestions.webp`, `drafting-analysis.webp`) y las páginas públicas de itero.gg; no se revisaron Porofessor, Mobalytics, Blitz ni U.GG (solo conocimiento general de su estilo, sin consulta nueva). Las capturas se guardaron solo en una carpeta temporal fuera del repo.

## Cualidades observadas (se estudian, no se copian)
- **Imagen real en vez de iniciales**: retratos de campeón, iconos de objeto y de runa en cada fila; la tabla se lee por imágenes antes que por texto.
- **Una sola familia de acento** sobre grises casi neutros; el color restante es semántico (verde/ámbar/rojo) y solo en cifras.
- **Números como protagonistas**: cifras en negrita, tabulares, alineadas a la derecha; el texto es etiqueta de 11-12 px.
- **Alta densidad con cuadrícula estricta**: filas de 32-56 px, huecos de 4/8/16 px, bordes de 1 px en vez de sombras o brillos.
- **Pocas palabras**: encabezados de columna y etiquetas cortas; nada de frases explicativas dentro de cada panel.
- **Estructura de herramienta, no de chat**: tres columnas (contexto, lista de opciones, detalle); equipos en una banda superior con retratos; el chat es un panel lateral o una entrada, nunca el centro.
- **Builds como filas de iconos**: orden de compra, runas en árbol real y hechizos con su cifra al lado.

## Qué hacía que A/B/C parecieran "hechas por IA" (D lo evita)
- Avatares con inicial sobre degradado en lugar de arte; D usa huecos de imagen neutros y rotulados.
- Paleta violeta + menta y degradados/brillos; D usa un azul y grises, sin degradados decorativos.
- Titulares serif (B) y tipografía de "editorial"; D usa la fuente del sistema.
- Frases de ayuda en cada panel ("Tú eliges; DraftGap no elige por ti"); D deja una sola línea discreta, "para comparar".
- Etiquetas charlatanas, píldoras de colores y badges tipo emoji; D usa etiquetas de dos palabras.
- Tarjetas grandes con una cifra y mucho aire, y chat como protagonista; D es denso y el chat va aparte.

## Lo que D no copia de iTero
Ni logo, nombre, teal, tipografía, composición exacta (barra de equipos con "VS" en la cabecera de la ventana, rejilla de recomendaciones de solo retratos con puntuaciones de color), textos, ni sus puntuaciones propias ("Overall Score", "Laning Phase Score"). Solo se toman principios generales: imagen real, densidad, un acento, cifras con color.
