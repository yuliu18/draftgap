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
