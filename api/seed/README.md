# Semilla de alimentos genéricos de Lean

`foods.csv` complementa los alimentos envasados de Open Food Facts. Contiene alimentos genéricos y algunas preparaciones de referencia. Los estados crudo, hervido, asado o escurrido identifican el alimento al que corresponden los valores: no son factores de conversión entre pesos crudos y cocidos.

## Formato y unidades

CSV UTF-8 sin BOM, separado por comas, con saltos LF y un único salto final. Cada fila contiene:

| Columna         | Significado                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `name`          | Nombre en español rioplatense y estado de preparación cuando corresponde. Único sin distinguir mayúsculas ni tildes. |
| `kcal_100g`     | Energía en kilocalorías por 100 g de porción comestible; entero.                                                     |
| `protein_100g`  | Proteínas en gramos por 100 g de porción comestible.                                                                 |
| `carbs_100g`    | Carbohidratos totales por diferencia de USDA en gramos por 100 g; incluyen fibra. No son carbohidratos netos.        |
| `fat_100g`      | Grasas totales en gramos por 100 g de porción comestible.                                                            |
| `serving_g`     | Peso comestible orientativo de la porción en gramos, hasta un decimal.                                               |
| `serving_label` | Descripción de esa porción. Vacío junto con `serving_g` si no se propone una medida doméstica.                       |

Los macronutrientes tienen hasta dos decimales. Las porciones son ayudas de carga, no recomendaciones de consumo; los puñados, rebanadas y recipientes reales deben pesarse. Las medidas domésticas se redondean para uso práctico y no constituyen una transcripción sistemática de las medidas de USDA. Una taza no equivale universalmente a 100 g ni a un vaso. Las porciones de frutas excluyen cáscaras no comestibles y carozos; pescados, mariscos y carnes excluyen huesos o caparazones. Las conservas indicadas como escurridas se pesan después de escurrir. Las carnes cocidas son asadas con calor seco salvo aclaración; los vegetales hervidos no incluyen sal ni aceite añadidos.

## Fuente y alcance de la exactitud

Fuente nutricional: [USDA FoodData Central](https://fdc.nal.usda.gov/), principalmente entradas de **SR Legacy**, de dominio público, publicadas bajo **CC0**. La tabla al final identifica la descripción de la entrada utilizada para cada fila. No se agregan FDC IDs recordados con incertidumbre.

La selección original se realizó **sin acceso a la red ni a una descarga local de USDA**, usando conocimiento recordado de esas entradas. El alcance del cotejo externo se detalla en «Verificación». Antes de considerar esta semilla una transcripción auditada, queda pendiente cotejar las demás filas con un export oficial, completar los FDC IDs y registrar la versión del dataset. La comprobación matemática documentada abajo verifica consistencia interna, no identidad con la fuente.

## Verificación

El orquestador cotejó contra USDA FoodData Central (SR Legacy) las **23 filas agregadas en la corrección anterior** y las **6 filas de esta corrección**: Queso parmesano rallado, Queso untable entero, Queso cheddar, Ricota entera, Asado de tira braseado y Brócoli crudo. Sus FDC IDs y descripciones figuran en la tabla de correspondencias, con la indicación «verificado contra FDC».

También cotejó un muestreo de **15 filas**: pechuga de pollo cocida, carne picada común, huevo crudo, leche entera, yogur entero, mozzarella, dulce de leche, avena, batata hervida, tomate, banana, manzana, palta, almendras y pan francés; además de los quesos port salut, parmesano, azul, cottage y ricota parcialmente descremada. Todos quedaron dentro de **±10 %** de los valores de FDC.

Las demás filas provienen del conocimiento de USDA del subagente, **sin cotejo fila por fila**.

Los valores representan la entrada USDA seleccionada, no una medición de productos argentinos. Las recetas, marcas, especies, humedad y porcentaje de grasa pueden cambiar sustancialmente el resultado. No se promediaron entradas ni se ajustaron nutrientes para cerrar las calorías.

## Equivalencias argentinas

Se conserva la especie o tipo USDA en el nombre cuando no hay equivalencia segura: por ejemplo **pollock del Atlántico** no se etiqueta como merluza ni como abadejo argentino. El arroz yamaní se aproxima con arroz integral de grano medio; la polenta con harina de maíz desgerminada y grits cocidos; el queso cremoso con mozzarella entera. Los porcentajes de grasa de la carne picada están fijados en la correspondencia y no garantizan la composición de una compra en carnicería. El lomo de cerdo usa tenderloin (solomillo) sin grasa separable.

Los productos con receta y los equivalentes argentinos llevan una nota explícita en la columna «Alcance / aproximación» de la tabla. «Directa» significa correspondencia con el alimento descrito, sin una sustitución local deliberada; no implica certificación analítica ni verificación externa. La misma entrada puede respaldar nombres locales distintos, como mozzarella y cremoso, con la sustitución declarada.

Se mantienen pendientes bondiola, carré, jamón crudo, milanesas, cuartirolo, queso blanco local, ñoquis, zapallito redondo, mate, fernet, alfajor, facturas, bizcochitos, prepizza, tapas de empanada, dulce de batata y dulce de membrillo. Bagel y gaseosa cola común siguen pendientes por incertidumbre de transcripción.

## Validación de la energía

Se calculó para cada fila `E = 4 × proteínas + 4 × carbohidratos + 9 × grasas`. Se exige `|E − kcal| ≤ 0.20 × kcal`; cuando `kcal < 20`, se exige `|E − kcal| ≤ 5`. Los factores generales no reproducen siempre los factores específicos de Atwater, la contribución de fibra, ácidos orgánicos o alcohol de USDA.

Las excepciones alcohólicas presentes son **Cerveza**, **Vino tinto**, **Vino blanco** y **Whisky**: el etanol aporta energía que no figura en los tres macronutrientes. Whisky representa un destilado de 40 % vol. La lista de excepciones admitida por el importador también contempla Fernet, Vodka, Gin y Ron, que no se incluyen en este archivo.

Se agregan excepciones explícitas para **Espinaca cruda**, **Espinaca hervida**, **Acelga hervida**, **Brócoli crudo**, **Champiñones crudos** y **Champiñones hervidos**. Son verduras con mucha fibra y agua, cuya energía USDA se calcula con factores de Atwater específicos, menores que 4/4/9. **Limón sin cáscara crudo** tiene una excepción por sus ácidos orgánicos y fibra, con factores de Atwater específicos de USDA. El test exige que cada excepción no alcohólica exista en el CSV real. Las excepciones alcohólicas pueden faltar.

La tolerancia absoluta de **±5 kcal para alimentos de menos de 20 kcal** se mantiene por decisión del orquestador.

Se mantienen excluidos por no cumplir la tolerancia repollo blanco hervido, palmitos en conserva, lima, cacao amargo y vinagre de vino tinto. No se redujeron sus carbohidratos ni se alteraron sus kilocalorías para hacerlos pasar. El vinagre contiene ácidos orgánicos que esta fórmula no contempla; la exclusión no implica que su energía USDA sea incorrecta.

**Resultado del control:** 316 filas; 305 cumplen la regla general; 4 excepciones alcohólicas y 7 excepciones por factores específicos de Atwater permitidas; **sin fallas**. Los valores verificados de FDC (34 kcal, 2.82 g de proteínas, 6.64 g de carbohidratos y 0.37 g de grasas por 100 g) producen 41.17 kcal con 4/4/9, una diferencia de 21.09 %, superior al límite de 20 %. Se conservan los valores exactos de FDC y se admite Brócoli crudo como excepción por factores específicos de Atwater en el validador. También pasan encabezado, unicidad normalizada, no negatividad, suma de macronutrientes ≤ 100, precisión decimal y pares de porción completos.

## Carga

Desde la raíz del repositorio:

```sh
pnpm --filter @lean/api seed:foods
```

El script `api/scripts/seed-foods.ts` está implementado en esta rama. Valida el CSV antes de escribir y es idempotente por nombre entre las filas `source = 'seed'`. Los nombres funcionan como claves de la semilla. Un cambio de nombre incorpora una clave nueva y el importador informa las claves de la base ausentes del CSV. Si ya se cargó «Medialuna de manteca», queda pendiente migrar esa fila a «Croissant de manteca» en la base existente.

El importador no borra ni renombra filas `seed`. Si se renombra un alimento en el CSV, la fila vieja queda en la base y el script la lista en el aviso «En la base pero no en el CSV». Hay que borrarla a mano si no la usa ningún registro.

## Cobertura y pendientes

| Categoría               |   Filas |
| ----------------------- | ------: |
| Carnes y pescados       |      61 |
| Huevos y lácteos        |      28 |
| Cereales y derivados    |      32 |
| Legumbres               |      20 |
| Verduras                |      58 |
| Frutas                  |      42 |
| Frutos secos y semillas |      17 |
| Aceites y grasas        |       9 |
| Panificados             |      16 |
| Bebidas                 |      15 |
| Dulces y despensa       |      18 |
| **Total**               | **316** |

Las correspondencias aproximadas y las formulaciones variables se explican en la tabla siguiente. Quedan pendientes el cotejo externo de las filas aún no verificadas y los identificadores faltantes, la versión del dataset y la cobertura de los productos argentinos aún omitidos. La excepción de Brócoli crudo indicada arriba ya está incorporada en el validador.

## Correspondencia completa con USDA

### Carnes y pescados

| Nombre en el CSV                    | FDC ID | Descripción de la entrada USDA                                                                                         | Alcance / aproximación                                                                                                                         |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Pechuga de pollo sin piel cruda     |        | Chicken, broilers or fryers, breast, skinless, boneless, meat only, raw                                                | Directa                                                                                                                                        |
| Pechuga de pollo sin piel cocida    |        | Chicken, broilers or fryers, breast, meat only, cooked, roasted                                                        | Directa                                                                                                                                        |
| Pechuga de pollo con piel cruda     |        | Chicken, broilers or fryers, breast, meat and skin, raw                                                                | Directa                                                                                                                                        |
| Pechuga de pollo con piel cocida    |        | Chicken, broilers or fryers, breast, meat and skin, cooked, roasted                                                    | Directa                                                                                                                                        |
| Muslo de pollo sin piel crudo       |        | Chicken, broilers or fryers, thigh, meat only, raw                                                                     | Directa                                                                                                                                        |
| Muslo de pollo sin piel cocido      |        | Chicken, broilers or fryers, thigh, meat only, cooked, roasted                                                         | Directa                                                                                                                                        |
| Muslo de pollo con piel crudo       |        | Chicken, broilers or fryers, thigh, meat and skin, raw                                                                 | Directa                                                                                                                                        |
| Muslo de pollo con piel cocido      |        | Chicken, broilers or fryers, thigh, meat and skin, cooked, roasted                                                     | Directa                                                                                                                                        |
| Pata de pollo sin piel cruda        |        | Chicken, broilers or fryers, drumstick, meat only, raw                                                                 | Directa                                                                                                                                        |
| Pata de pollo sin piel cocida       |        | Chicken, broilers or fryers, drumstick, meat only, cooked, roasted                                                     | Directa                                                                                                                                        |
| Pata de pollo con piel cruda        |        | Chicken, broilers or fryers, drumstick, meat and skin, raw                                                             | Directa                                                                                                                                        |
| Pata de pollo con piel cocida       |        | Chicken, broilers or fryers, drumstick, meat and skin, cooked, roasted                                                 | Directa                                                                                                                                        |
| Pollo sin piel crudo                |        | Chicken, broilers or fryers, meat only, raw                                                                            | Directa                                                                                                                                        |
| Pollo sin piel cocido               |        | Chicken, broilers or fryers, meat only, cooked, roasted                                                                | Directa                                                                                                                                        |
| Pollo con piel crudo                |        | Chicken, broilers or fryers, meat and skin, raw                                                                        | Directa                                                                                                                                        |
| Pollo con piel cocido               |        | Chicken, broilers or fryers, meat and skin, cooked, roasted                                                            | Directa                                                                                                                                        |
| Bife de chorizo crudo               | 171775 | Beef, loin, top loin steak, boneless, lip-on, separable lean and fat, trimmed to 1/8" fat, all grades, raw             | verificado contra FDC                                                                                                                          |
| Bife de chorizo a la parrilla       | 174714 | Beef, loin, top loin steak, boneless, lip-on, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, grilled | verificado contra FDC                                                                                                                          |
| Lomo vacuno crudo                   | 169542 | Beef, tenderloin, steak, separable lean and fat, trimmed to 1/8" fat, all grades, raw                                  | verificado contra FDC                                                                                                                          |
| Lomo vacuno a la parrilla           | 169543 | Beef, tenderloin, steak, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, broiled                      | verificado contra FDC. USDA usa broiled, calor seco bajo una fuente de calor superior, como aproximación de la cocción local indicada          |
| Nalga cruda                         | 169529 | Beef, round, top round, steak, separable lean and fat, trimmed to 1/8" fat, all grades, raw                            | verificado contra FDC                                                                                                                          |
| Nalga a la plancha                  | 169531 | Beef, round, top round steak, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, broiled                 | verificado contra FDC. USDA usa broiled, calor seco bajo una fuente de calor superior, como aproximación de la cocción local indicada          |
| Peceto crudo                        | 169523 | Beef, round, eye of round, roast, separable lean and fat, trimmed to 1/8" fat, all grades, raw                         | verificado contra FDC                                                                                                                          |
| Peceto al horno                     | 169524 | Beef, round, eye of round, roast, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, roasted             | verificado contra FDC                                                                                                                          |
| Tapa de cuadril cruda               | 174706 | Beef, loin, top sirloin cap steak, boneless, separable lean and fat, trimmed to 1/8" fat, all grades, raw              | verificado contra FDC                                                                                                                          |
| Tapa de cuadril a la parrilla       | 173061 | Beef, loin, top sirloin cap steak, boneless, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, grilled  | verificado contra FDC                                                                                                                          |
| Vacío magro crudo                   | 169563 | Beef, flank, steak, separable lean and fat, trimmed to 0" fat, all grades, raw                                         | verificado contra FDC. Aproximación con flank steak desgrasado. El vacío argentino suele tener más grasa                                       |
| Vacío magro a la parrilla           | 168733 | Beef, flank, steak, separable lean and fat, trimmed to 0" fat, all grades, cooked, broiled                             | verificado contra FDC. Aproximación con flank steak desgrasado. El vacío argentino suele tener más grasa                                       |
| Asado de tira crudo                 | 170826 | Beef, chuck, short ribs, boneless, separable lean and fat, trimmed to 0" fat, all grades, raw                          | verificado contra FDC. Aproximación con short ribs de chuck sin hueso                                                                          |
| Asado de tira braseado              | 171222 | Beef, chuck, short ribs, boneless, separable lean and fat, trimmed to 0" fat, all grades, cooked, braised              | verificado contra FDC. Aproximación con short ribs de chuck sin hueso, cocidos por braseado. La cocción a la parrilla requiere otra referencia |
| Carne picada vacuna común cruda     |        | Beef, ground, 80% lean meat / 20% fat, raw                                                                             | 20 % de grasa como definición operativa de común; varía entre carnicerías                                                                      |
| Carne picada vacuna magra cruda     |        | Beef, ground, 90% lean meat / 10% fat, raw                                                                             | 10 % de grasa como definición operativa de magra                                                                                               |
| Carne picada vacuna muy magra cruda |        | Beef, ground, 95% lean meat / 5% fat, raw                                                                              | 5 % de grasa como definición operativa de muy magra                                                                                            |
| Hígado vacuno crudo                 |        | Beef, variety meats and by-products, liver, raw                                                                        | Directa                                                                                                                                        |
| Hígado vacuno cocido a la plancha   |        | Beef, variety meats and by-products, liver, cooked, pan-fried                                                          | Directa                                                                                                                                        |
| Hígado de pollo crudo               |        | Chicken, liver, all classes, raw                                                                                       | Directa                                                                                                                                        |
| Hígado de pollo hervido             |        | Chicken, liver, all classes, cooked, simmered                                                                          | Directa                                                                                                                                        |
| Lomo de cerdo crudo                 |        | Pork, fresh, loin, tenderloin, separable lean only, raw                                                                | Lomo identificado con solomillo/tenderloin sin grasa separable                                                                                 |
| Lomo de cerdo cocido                |        | Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted                                                    | Lomo identificado con solomillo/tenderloin sin grasa separable                                                                                 |
| Jamón cocido                        | 173864 | Ham, sliced, regular (approximately 11% fat)                                                                           | verificado contra FDC                                                                                                                          |
| Salame                              |        | Salami, dry or hard, pork and beef                                                                                     | Salami seco de cerdo y vacuno como equivalente                                                                                                 |
| Panceta cruda                       |        | Pork, cured, bacon, unprepared                                                                                         | Bacon curado como equivalente de panceta; puede ser ahumado                                                                                    |
| Panceta cocida crocante             |        | Pork, cured, bacon, cooked, pan-fried                                                                                  | Bacon curado frito y escurrido                                                                                                                 |
| Merluza cruda                       | 173713 | Fish, whiting, mixed species, raw                                                                                      | verificado contra FDC. Aproximación con whiting, mixed species. En EE. UU. incluye la merluza plateada, Merluccius bilinearis                  |
| Merluza cocida                      | 175161 | Fish, whiting, mixed species, cooked, dry heat                                                                         | verificado contra FDC. Aproximación con whiting, mixed species. En EE. UU. incluye la merluza plateada, Merluccius bilinearis                  |
| Salmón de criadero crudo            |        | Fish, salmon, Atlantic, farmed, raw                                                                                    | Directa                                                                                                                                        |
| Salmón de criadero cocido           |        | Fish, salmon, Atlantic, farmed, cooked, dry heat                                                                       | Directa                                                                                                                                        |
| Salmón salvaje crudo                |        | Fish, salmon, Atlantic, wild, raw                                                                                      | Directa                                                                                                                                        |
| Salmón salvaje cocido               |        | Fish, salmon, Atlantic, wild, cooked, dry heat                                                                         | Directa                                                                                                                                        |
| Atún al natural escurrido           |        | Fish, tuna, light, canned in water, drained solids                                                                     | Directa                                                                                                                                        |
| Atún en aceite escurrido            |        | Fish, tuna, light, canned in oil, drained solids                                                                       | Directa                                                                                                                                        |
| Sardinas en aceite escurridas       |        | Fish, sardine, Atlantic, canned in oil, drained solids with bone                                                       | Directa                                                                                                                                        |
| Langostinos crudos pelados          |        | Crustaceans, shrimp, mixed species, raw                                                                                | Mezcla de camarones USDA; especie de langostino argentino distinta                                                                             |
| Langostinos cocidos pelados         |        | Crustaceans, shrimp, mixed species, cooked, moist heat                                                                 | Mezcla de camarones USDA; especie de langostino argentino distinta                                                                             |
| Bacalao crudo                       |        | Fish, cod, Atlantic, raw                                                                                               | Directa                                                                                                                                        |
| Bacalao cocido                      |        | Fish, cod, Atlantic, cooked, dry heat                                                                                  | Directa                                                                                                                                        |
| Pollock del Atlántico crudo         |        | Fish, pollock, Atlantic, raw                                                                                           | Directa                                                                                                                                        |
| Tilapia cruda                       |        | Fish, tilapia, raw                                                                                                     | Directa                                                                                                                                        |
| Tilapia cocida                      |        | Fish, tilapia, cooked, dry heat                                                                                        | Directa                                                                                                                                        |
| Trucha arcoíris de criadero cruda   |        | Fish, trout, rainbow, farmed, raw                                                                                      | Directa                                                                                                                                        |
| Trucha arcoíris de criadero cocida  |        | Fish, trout, rainbow, farmed, cooked, dry heat                                                                         | Directa                                                                                                                                        |

### Huevos y lácteos

| Nombre en el CSV                      | FDC ID | Descripción de la entrada USDA                                           | Alcance / aproximación                                                                |
| ------------------------------------- | ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Huevo entero crudo                    |        | Egg, whole, raw, fresh                                                   | Directa                                                                               |
| Huevo duro                            |        | Egg, whole, cooked, hard-boiled                                          | Directa                                                                               |
| Huevo frito                           |        | Egg, whole, cooked, fried                                                | Directa                                                                               |
| Clara de huevo cruda                  |        | Egg, white, raw, fresh                                                   | Directa                                                                               |
| Yema de huevo cruda                   |        | Egg, yolk, raw, fresh                                                    | Directa                                                                               |
| Leche entera                          |        | Milk, whole, 3.25% milkfat, with added vitamin D                         | Directa                                                                               |
| Leche descremada                      |        | Milk, nonfat, fluid, with added vitamin A and vitamin D                  | Directa                                                                               |
| Leche parcialmente descremada al 2 %  |        | Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D | Directa                                                                               |
| Leche parcialmente descremada al 1 %  |        | Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D      | Directa                                                                               |
| Yogur natural entero                  |        | Yogurt, plain, whole milk                                                | Directa                                                                               |
| Yogur natural descremado              |        | Yogurt, plain, skim milk                                                 | Directa                                                                               |
| Yogur natural parcialmente descremado |        | Yogurt, plain, low fat                                                   | Directa                                                                               |
| Yogur griego natural descremado       |        | Yogurt, Greek, plain, nonfat                                             | Directa                                                                               |
| Yogur griego natural entero           |        | Yogurt, Greek, plain, whole milk                                         | Directa                                                                               |
| Queso mozzarella entero               |        | Cheese, mozzarella, whole milk                                           | Directa                                                                               |
| Queso cremoso                         |        | Cheese, mozzarella, whole milk                                           | Proxy de mozzarella entera; humedad y grasa del cremoso argentino variables           |
| Queso port salut                      |        | Cheese, port de salut                                                    | Port de salut USDA; no equivale a versiones argentinas light                          |
| Queso parmesano                       |        | Cheese, parmesan, hard                                                   | Directa                                                                               |
| Queso parmesano rallado               | 171247 | Cheese, parmesan, grated                                                 | verificado contra FDC                                                                 |
| Queso untable entero                  | 173418 | Cheese, cream                                                            | verificado contra FDC. Cream cheese entero; las marcas argentinas difieren en humedad |
| Ricota entera                         | 170851 | Cheese, ricotta, whole milk                                              | verificado contra FDC                                                                 |
| Ricota parcialmente descremada        |        | Cheese, ricotta, part skim milk                                          | Directa                                                                               |
| Queso cottage                         |        | Cheese, cottage, creamed, large or small curd                            | Directa                                                                               |
| Queso cheddar                         | 173414 | Cheese, cheddar                                                          | verificado contra FDC                                                                 |
| Queso azul                            |        | Cheese, blue                                                             | Directa                                                                               |
| Manteca con sal                       |        | Butter, salted                                                           | Directa                                                                               |
| Crema de leche espesa                 |        | Cream, fluid, heavy whipping                                             | Crema USDA de aproximadamente 36 % de grasa                                           |
| Dulce de leche                        |        | Dulce de Leche                                                           | Directa                                                                               |

### Cereales y derivados

| Nombre en el CSV                   | FDC ID | Descripción de la entrada USDA                                                            | Alcance / aproximación                                                    |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Arroz blanco largo crudo           |        | Rice, white, long-grain, regular, enriched, uncooked                                      | Directa                                                                   |
| Arroz blanco largo cocido          |        | Rice, white, long-grain, regular, enriched, cooked                                        | Directa                                                                   |
| Arroz blanco de grano corto crudo  |        | Rice, white, short-grain, enriched, uncooked                                              | Directa                                                                   |
| Arroz blanco de grano corto cocido |        | Rice, white, short-grain, enriched, cooked                                                | Directa                                                                   |
| Arroz integral largo crudo         |        | Rice, brown, long-grain, raw                                                              | Directa                                                                   |
| Arroz integral largo cocido        |        | Rice, brown, long-grain, cooked                                                           | Directa                                                                   |
| Arroz yamaní crudo                 |        | Rice, brown, medium-grain, raw                                                            | Arroz integral de grano medio como aproximación de yamaní                 |
| Arroz yamaní cocido                |        | Rice, brown, medium-grain, cooked                                                         | Arroz integral de grano medio como aproximación de yamaní                 |
| Fideos secos de sémola crudos      |        | Pasta, dry, enriched                                                                      | Directa                                                                   |
| Fideos de sémola cocidos           |        | Pasta, cooked, enriched, without added salt                                               | Directa                                                                   |
| Fideos integrales crudos           |        | Spaghetti, whole-wheat, dry                                                               | Directa                                                                   |
| Fideos integrales cocidos          |        | Spaghetti, whole-wheat, cooked                                                            | Directa                                                                   |
| Avena arrollada seca               |        | Cereals, oats, regular and quick, not fortified, dry                                      | Directa                                                                   |
| Avena cocida en agua               |        | Cereals, oats, regular and quick, not fortified, cooked with water, without salt          | Directa                                                                   |
| Polenta seca                       |        | Cornmeal, degermed, enriched, yellow                                                      | Harina de maíz amarilla desgerminada; molienda de polenta variable        |
| Polenta cocida en agua             |        | Cereals, corn grits, yellow, regular and quick, enriched, cooked with water, without salt | Grits cocidos como aproximación de polenta; depende de hidratación        |
| Harina de trigo blanca             |        | Wheat flour, white, all-purpose, unenriched                                               | Directa                                                                   |
| Harina de trigo integral           |        | Wheat flour, whole-grain                                                                  | Directa                                                                   |
| Sémola de trigo seca               |        | Semolina, unenriched                                                                      | Directa                                                                   |
| Quinoa cruda                       |        | Quinoa, uncooked                                                                          | Directa                                                                   |
| Quinoa cocida                      |        | Quinoa, cooked                                                                            | Directa                                                                   |
| Cebada perlada cruda               |        | Barley, pearled, raw                                                                      | Directa                                                                   |
| Cebada perlada cocida              |        | Barley, pearled, cooked                                                                   | Directa                                                                   |
| Cuscús seco                        |        | Couscous, dry                                                                             | Directa                                                                   |
| Cuscús cocido                      |        | Couscous, cooked                                                                          | Directa                                                                   |
| Choclo amarillo crudo desgranado   |        | Corn, sweet, yellow, raw                                                                  | Directa                                                                   |
| Choclo amarillo hervido desgranado |        | Corn, sweet, yellow, cooked, boiled, drained, without salt                                | Directa                                                                   |
| Copos de maíz                      |        | Cereals ready-to-eat, KELLOGG, KELLOGG'S Corn Flakes                                      | Copos simples de una marca USDA; azúcar y fortificación dependen de marca |
| Granola casera                     |        | Cereals ready-to-eat, granola, homemade                                                   | Receta USDA; mezclas comerciales muy variables                            |
| Arroz inflado                      |        | Cereals ready-to-eat, rice, puffed, fortified                                             | Directa                                                                   |
| Galletas de arroz integral simples |        | Snacks, rice cakes, brown rice, plain                                                     | Directa                                                                   |
| Bulgur cocido                      |        | Bulgur, cooked                                                                            | Directa                                                                   |

### Legumbres

| Nombre en el CSV               | FDC ID | Descripción de la entrada USDA                                                      | Alcance / aproximación |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------- | ---------------------- |
| Lentejas secas crudas          |        | Lentils, raw                                                                        | Directa                |
| Lentejas hervidas              |        | Lentils, mature seeds, cooked, boiled, without salt                                 | Directa                |
| Garbanzos secos crudos         |        | Chickpeas (garbanzo beans, bengal gram), mature seeds, raw                          | Directa                |
| Garbanzos hervidos             |        | Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt | Directa                |
| Porotos negros secos crudos    |        | Beans, black, mature seeds, raw                                                     | Directa                |
| Porotos negros hervidos        |        | Beans, black, mature seeds, cooked, boiled, without salt                            | Directa                |
| Porotos blancos secos crudos   |        | Beans, white, mature seeds, raw                                                     | Directa                |
| Porotos blancos hervidos       |        | Beans, white, mature seeds, cooked, boiled, without salt                            | Directa                |
| Porotos colorados secos crudos |        | Beans, kidney, red, mature seeds, raw                                               | Directa                |
| Porotos colorados hervidos     |        | Beans, kidney, red, mature seeds, cooked, boiled, without salt                      | Directa                |
| Arvejas verdes crudas          |        | Peas, green, raw                                                                    | Directa                |
| Arvejas verdes hervidas        |        | Peas, green, cooked, boiled, drained, without salt                                  | Directa                |
| Arvejas partidas secas crudas  |        | Peas, split, mature seeds, raw                                                      | Directa                |
| Arvejas partidas hervidas      |        | Peas, split, mature seeds, cooked, boiled, without salt                             | Directa                |
| Soja seca cruda                |        | Soybeans, mature seeds, raw                                                         | Directa                |
| Soja hervida                   |        | Soybeans, mature seeds, cooked, boiled, without salt                                | Directa                |
| Poroto mung seco crudo         |        | Mung beans, mature seeds, raw                                                       | Directa                |
| Poroto mung hervido            |        | Mung beans, mature seeds, cooked, boiled, without salt                              | Directa                |
| Tofu firme con calcio          |        | Tofu, raw, firm, prepared with calcium sulfate                                      | Directa                |
| Tofu blando con calcio         |        | Tofu, soft, prepared with calcium sulfate and magnesium chloride (nigari)           | Directa                |

### Verduras

| Nombre en el CSV             | FDC ID | Descripción de la entrada USDA                                                 | Alcance / aproximación                                                   |
| ---------------------------- | ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Papa con cáscara cruda       |        | Potatoes, flesh and skin, raw                                                  | Directa                                                                  |
| Papa sin cáscara hervida     |        | Potatoes, boiled, cooked without skin, flesh, without salt                     | Directa                                                                  |
| Papa con cáscara al horno    |        | Potatoes, baked, flesh and skin, without salt                                  | Directa                                                                  |
| Batata cruda                 |        | Sweet potato, raw, unprepared                                                  | Directa                                                                  |
| Batata sin cáscara hervida   |        | Sweet potato, cooked, boiled, without skin                                     | Directa                                                                  |
| Batata al horno              |        | Sweet potato, cooked, baked in skin, flesh, without salt                       | Directa                                                                  |
| Zapallo crudo                |        | Pumpkin, raw                                                                   | Pumpkin USDA genérico; especie y variedad de zapallo argentino variables |
| Zapallo hervido              |        | Pumpkin, cooked, boiled, drained, without salt                                 | Pumpkin USDA genérico; especie y variedad de zapallo argentino variables |
| Calabaza anco cruda          |        | Squash, winter, butternut, raw                                                 | Directa                                                                  |
| Calabaza anco al horno       |        | Squash, winter, butternut, cooked, baked, without salt                         | Directa                                                                  |
| Zanahoria cruda              |        | Carrots, raw                                                                   | Directa                                                                  |
| Zanahoria hervida            |        | Carrots, cooked, boiled, drained, without salt                                 | Directa                                                                  |
| Tomate redondo crudo         |        | Tomatoes, red, ripe, raw, year round average                                   | Directa                                                                  |
| Tomate rojo cocido           |        | Tomatoes, red, ripe, cooked                                                    | Directa                                                                  |
| Lechuga mantecosa cruda      |        | Lettuce, butterhead (includes boston and bibb types), raw                      | Directa                                                                  |
| Lechuga romana cruda         |        | Lettuce, cos or romaine, raw                                                   | Directa                                                                  |
| Lechuga iceberg cruda        |        | Lettuce, iceberg (includes crisphead types), raw                               | Directa                                                                  |
| Lechuga de hoja verde cruda  |        | Lettuce, green leaf, raw                                                       | Directa                                                                  |
| Espinaca cruda               | 168462 | Spinach, raw                                                                   | verificado contra FDC                                                    |
| Espinaca hervida             | 168463 | Spinach, cooked, boiled, drained, without salt                                 | verificado contra FDC                                                    |
| Acelga cruda                 |        | Chard, swiss, raw                                                              | Directa                                                                  |
| Acelga hervida               | 170401 | Chard, swiss, cooked, boiled, drained, without salt                            | verificado contra FDC                                                    |
| Champiñones crudos           | 169251 | Mushrooms, white, raw                                                          | verificado contra FDC                                                    |
| Champiñones hervidos         | 169252 | Mushrooms, white, cooked, boiled, drained, without salt                        | verificado contra FDC                                                    |
| Cebolla cruda                |        | Onions, raw                                                                    | Directa                                                                  |
| Cebolla hervida              |        | Onions, cooked, boiled, drained, without salt                                  | Directa                                                                  |
| Cebolla de verdeo cruda      |        | Onions, spring or scallions (includes tops and bulb), raw                      | Directa                                                                  |
| Ajo crudo                    |        | Garlic, raw                                                                    | Directa                                                                  |
| Morrón rojo crudo            |        | Peppers, sweet, red, raw                                                       | Directa                                                                  |
| Morrón verde crudo           |        | Peppers, sweet, green, raw                                                     | Directa                                                                  |
| Morrón amarillo crudo        |        | Peppers, sweet, yellow, raw                                                    | Directa                                                                  |
| Berenjena cruda              |        | Eggplant, raw                                                                  | Directa                                                                  |
| Berenjena hervida            |        | Eggplant, cooked, boiled, drained, without salt                                | Directa                                                                  |
| Zucchini con cáscara crudo   |        | Squash, summer, zucchini, includes skin, raw                                   | Directa                                                                  |
| Zucchini con cáscara hervido |        | Squash, summer, zucchini, includes skin, cooked, boiled, drained, without salt | Directa                                                                  |
| Brócoli crudo                | 170379 | Broccoli, raw                                                                  | verificado contra FDC                                                    |
| Brócoli hervido              |        | Broccoli, cooked, boiled, drained, without salt                                | Directa                                                                  |
| Repollo blanco crudo         |        | Cabbage, raw                                                                   | Directa                                                                  |
| Repollo colorado crudo       |        | Cabbage, red, raw                                                              | Directa                                                                  |
| Repollo colorado hervido     |        | Cabbage, red, cooked, boiled, drained, without salt                            | Directa                                                                  |
| Pepino con cáscara crudo     |        | Cucumber, with peel, raw                                                       | Directa                                                                  |
| Pepino pelado crudo          |        | Cucumber, peeled, raw                                                          | Directa                                                                  |
| Apio crudo                   |        | Celery, raw                                                                    | Directa                                                                  |
| Apio hervido                 |        | Celery, cooked, boiled, drained, without salt                                  | Directa                                                                  |
| Remolacha cruda              |        | Beets, raw                                                                     | Directa                                                                  |
| Remolacha hervida            |        | Beets, cooked, boiled, drained                                                 | Directa                                                                  |
| Chauchas crudas              |        | Beans, snap, green, raw                                                        | Directa                                                                  |
| Chauchas hervidas            |        | Beans, snap, green, cooked, boiled, drained, without salt                      | Directa                                                                  |
| Puerro crudo                 |        | Leeks, (bulb and lower leaf-portion), raw                                      | Directa                                                                  |
| Puerro hervido               |        | Leeks, (bulb and lower leaf-portion), cooked, boiled, drained, without salt    | Directa                                                                  |
| Rabanito crudo               |        | Radishes, raw                                                                  | Directa                                                                  |
| Aceitunas verdes en salmuera |        | Olives, pickled, canned or bottled, green                                      | Directa                                                                  |
| Aceitunas negras en conserva |        | Olives, ripe, canned (small-extra large)                                       | Directa                                                                  |
| Endivia cruda                |        | Endive, raw                                                                    | Directa                                                                  |
| Nabo crudo                   |        | Turnips, raw                                                                   | Directa                                                                  |
| Nabo hervido                 |        | Turnips, cooked, boiled, drained, without salt                                 | Directa                                                                  |
| Hinojo crudo                 |        | Fennel, bulb, raw                                                              | Directa                                                                  |
| Radicchio crudo              |        | Radicchio, raw                                                                 | Directa                                                                  |

### Frutas

| Nombre en el CSV                | FDC ID | Descripción de la entrada USDA                                       | Alcance / aproximación |
| ------------------------------- | ------ | -------------------------------------------------------------------- | ---------------------- |
| Banana cruda                    |        | Bananas, raw                                                         | Directa                |
| Manzana con cáscara cruda       |        | Apples, raw, with skin                                               | Directa                |
| Manzana sin cáscara cruda       |        | Apples, raw, without skin                                            | Directa                |
| Pera cruda                      |        | Pears, raw                                                           | Directa                |
| Limón sin cáscara crudo         | 167746 | Lemons, raw, without peel                                            | verificado contra FDC  |
| Naranja cruda                   |        | Oranges, raw, all commercial varieties                               | Directa                |
| Mandarina cruda                 |        | Tangerines, (mandarin oranges), raw                                  | Directa                |
| Pomelo rosado crudo             |        | Grapefruit, raw, pink and red, all areas                             | Directa                |
| Pomelo blanco crudo             |        | Grapefruit, raw, white, all areas                                    | Directa                |
| Frutillas crudas                |        | Strawberries, raw                                                    | Directa                |
| Durazno crudo                   |        | Peaches, yellow, raw                                                 | Directa                |
| Damasco crudo                   |        | Apricots, raw                                                        | Directa                |
| Ciruela cruda                   |        | Plums, raw                                                           | Directa                |
| Uvas rojas o verdes crudas      |        | Grapes, red or green (European type, such as Thompson seedless), raw | Directa                |
| Kiwi verde crudo                |        | Kiwifruit, green, raw                                                | Directa                |
| Ananá crudo                     |        | Pineapple, raw, all varieties                                        | Directa                |
| Mango crudo                     |        | Mangos, raw                                                          | Directa                |
| Melón cantalupo crudo           |        | Melons, cantaloupe, raw                                              | Directa                |
| Melón verde crudo               |        | Melons, honeydew, raw                                                | Directa                |
| Sandía cruda                    |        | Watermelon, raw                                                      | Directa                |
| Cerezas dulces crudas           |        | Cherries, sweet, raw                                                 | Directa                |
| Guindas crudas                  |        | Cherries, sour, red, raw                                             | Directa                |
| Arándanos crudos                |        | Blueberries, raw                                                     | Directa                |
| Frambuesas crudas               |        | Raspberries, raw                                                     | Directa                |
| Higos frescos crudos            |        | Figs, raw                                                            | Directa                |
| Palta cruda                     |        | Avocados, raw, all commercial varieties                              | Directa                |
| Membrillo crudo                 |        | Quinces, raw                                                         | Directa                |
| Pasas de uva sin semilla        |        | Raisins, seedless                                                    | Directa                |
| Ciruelas pasas sin carozo       |        | Plums, dried (prunes), uncooked                                      | Directa                |
| Dátiles Deglet Noor sin carozo  |        | Dates, deglet noor                                                   | Directa                |
| Dátiles Medjool sin carozo      |        | Dates, medjool                                                       | Directa                |
| Coco fresco pulpa               |        | Nuts, coconut meat, raw                                              | Directa                |
| Coco rallado seco sin azúcar    |        | Nuts, coconut meat, dried (desiccated), not sweetened                | Directa                |
| Papaya cruda                    |        | Papayas, raw                                                         | Directa                |
| Pelón crudo                     |        | Nectarines, raw                                                      | Directa                |
| Caqui crudo                     |        | Persimmons, japanese, raw                                            | Directa                |
| Guayaba cruda                   |        | Guavas, common, raw                                                  | Directa                |
| Damasco desecado                |        | Apricots, dried, sulfured, uncooked                                  | Directa                |
| Higos secos                     |        | Figs, dried, uncooked                                                | Directa                |
| Duraznos en almíbar escurridos  |        | Peaches, canned, heavy syrup, drained                                | Directa                |
| Puré de manzana sin azúcar      |        | Applesauce, canned, unsweetened, without added ascorbic acid         | Directa                |
| Frutillas congeladas sin azúcar |        | Strawberries, frozen, unsweetened                                    | Directa                |

### Frutos secos y semillas

| Nombre en el CSV                  | FDC ID | Descripción de la entrada USDA                                                    | Alcance / aproximación |
| --------------------------------- | ------ | --------------------------------------------------------------------------------- | ---------------------- |
| Almendras crudas                  |        | Nuts, almonds                                                                     | Directa                |
| Nueces de nogal                   |        | Nuts, walnuts, english                                                            | Directa                |
| Maní crudo                        |        | Peanuts, all types, raw                                                           | Directa                |
| Maní tostado sin sal              |        | Peanuts, all types, dry-roasted, without salt                                     | Directa                |
| Manteca de maní lisa con sal      |        | Peanut butter, smooth style, with salt                                            | Directa                |
| Castañas de cajú crudas           |        | Nuts, cashew nuts, raw                                                            | Directa                |
| Avellanas crudas                  |        | Nuts, hazelnuts or filberts                                                       | Directa                |
| Pistachos crudos pelados          |        | Nuts, pistachio nuts, raw                                                         | Directa                |
| Semillas de chía secas            |        | Seeds, chia seeds, dried                                                          | Directa                |
| Semillas de lino                  |        | Seeds, flaxseed                                                                   | Directa                |
| Semillas de girasol peladas secas |        | Seeds, sunflower seed kernels, dried                                              | Directa                |
| Semillas de sésamo enteras secas  |        | Seeds, sesame seeds, whole, dried                                                 | Directa                |
| Semillas de zapallo peladas secas |        | Seeds, pumpkin and squash seed kernels, dried                                     | Directa                |
| Nueces pecán                      |        | Nuts, pecans                                                                      | Directa                |
| Nueces de Brasil                  |        | Nuts, brazilnuts, dried, unblanched                                               | Directa                |
| Nueces de macadamia crudas        |        | Nuts, macadamia nuts, raw                                                         | Directa                |
| Pasta de sésamo tahini            |        | Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type) | Directa                |

### Aceites y grasas

| Nombre en el CSV                   | FDC ID | Descripción de la entrada USDA                                 | Alcance / aproximación |
| ---------------------------------- | ------ | -------------------------------------------------------------- | ---------------------- |
| Aceite de oliva                    |        | Oil, olive, salad or cooking                                   | Directa                |
| Aceite de girasol                  |        | Oil, sunflower, linoleic (less than 60%)                       | Directa                |
| Aceite de maíz                     |        | Oil, corn, industrial and retail, all purpose salad or cooking | Directa                |
| Aceite de canola                   |        | Oil, canola                                                    | Directa                |
| Aceite de soja                     |        | Oil, soybean, salad or cooking                                 | Directa                |
| Mayonesa común                     |        | Salad dressing, mayonnaise, regular                            | Directa                |
| Margarina al 80 % de grasa con sal |        | Margarine, regular, 80% fat, composite, stick, with salt       | Directa                |
| Grasa vacuna                       |        | Fat, beef tallow                                               | Directa                |
| Grasa de cerdo                     |        | Lard                                                           | Directa                |

### Panificados

| Nombre en el CSV             | FDC ID | Descripción de la entrada USDA                                   | Alcance / aproximación                                                                                    |
| ---------------------------- | ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Pan francés                  |        | Bread, french or vienna (includes sourdough)                     | Pan francés USDA; hidratación y receta argentina variables                                                |
| Pan lactal blanco            |        | Bread, white, commercially prepared (includes soft bread crumbs) | Pan blanco de molde USDA como equivalente                                                                 |
| Pan lactal integral          |        | Bread, whole-wheat, commercially prepared                        | Pan integral de molde USDA; porcentaje integral variable                                                  |
| Pan de salvado               |        | Bread, wheat bran                                                | Pan de salvado USDA como equivalente                                                                      |
| Pan árabe blanco             |        | Bread, pita, white, enriched                                     | Directa                                                                                                   |
| Pan árabe integral           |        | Bread, pita, whole-wheat                                         | Directa                                                                                                   |
| Tostada de pan blanco        |        | Bread, white, commercially prepared, toasted                     | Directa                                                                                                   |
| Tostada de pan integral      |        | Bread, whole-wheat, commercially prepared, toasted               | Directa                                                                                                   |
| Galletitas de agua           |        | Crackers, saltines (includes oyster, soda, soup)                 | Saltines USDA; galletitas de agua locales varían en grasa                                                 |
| Galletitas dulces de manteca |        | Cookies, butter, commercially prepared, enriched                 | Galletas butter cookies USDA como referencia de receta                                                    |
| Croissant de manteca         |        | Croissants, butter                                               | Croissant USDA de 57 g por unidad. La medialuna argentina requiere otra referencia por su tamaño y receta |
| Tortilla de trigo            |        | Tortillas, ready-to-bake or -fry, flour, shelf stable            | Directa                                                                                                   |
| Pan rallado seco             |        | Bread crumbs, dry, grated, plain                                 | Directa                                                                                                   |
| Pan de centeno               |        | Bread, rye                                                       | Directa                                                                                                   |
| Pan de hamburguesa           |        | Rolls, hamburger or hotdog, plain                                | Directa                                                                                                   |
| Galletitas de avena          |        | Cookies, oatmeal, commercially prepared, regular                 | Galletita de avena USDA; receta comercial variable                                                        |

### Bebidas

| Nombre en el CSV                    | FDC ID | Descripción de la entrada USDA                                                | Alcance / aproximación                                       |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Agua                                |        | Water, tap, drinking                                                          | Directa                                                      |
| Café negro preparado sin azúcar     |        | Beverages, coffee, brewed, prepared with tap water                            | Directa                                                      |
| Té negro preparado sin azúcar       |        | Beverages, tea, black, brewed, prepared with tap water                        | Directa                                                      |
| Té verde preparado sin azúcar       |        | Beverages, tea, green, brewed, regular                                        | Directa                                                      |
| Jugo de naranja exprimido           |        | Orange juice, raw                                                             | Directa                                                      |
| Jugo de manzana sin azúcar agregada |        | Apple juice, canned or bottled, unsweetened, without added ascorbic acid      | Directa                                                      |
| Jugo de uva sin azúcar agregada     |        | Grape juice, canned or bottled, unsweetened, without added ascorbic acid      | Directa                                                      |
| Jugo de tomate                      |        | Tomato juice, canned, without salt added                                      | Directa                                                      |
| Gaseosa cola light                  |        | Beverages, carbonated, cola, fast-food cola, diet                             | Cola dietética USDA; formulaciones locales variables         |
| Leche chocolatada entera            |        | Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D | Chocolatada comercial USDA; azúcar variable entre marcas     |
| Bebida isotónica                    |        | Beverages, sports drink, fruit-flavored, ready-to-drink                       | Bebida deportiva genérica USDA; azúcar variable entre marcas |
| Cerveza                             |        | Alcoholic beverage, beer, regular, all                                        | Cerveza regular USDA; graduación variable                    |
| Vino tinto                          |        | Alcoholic beverage, wine, table, red                                          | Vino tinto de mesa USDA; graduación y azúcar variables       |
| Vino blanco                         |        | Alcoholic beverage, wine, table, white                                        | Vino blanco de mesa USDA; graduación y azúcar variables      |
| Whisky                              |        | Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof        | Destilado USDA de 40 % vol.; no aplica a otras graduaciones  |

### Dulces y despensa

| Nombre en el CSV              | FDC ID | Descripción de la entrada USDA                        | Alcance / aproximación                                                                   |
| ----------------------------- | ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Azúcar blanca                 |        | Sugars, granulated                                    | Directa                                                                                  |
| Azúcar negra                  |        | Sugars, brown                                         | Brown sugar USDA; melaza y humedad variables en azúcar negra argentina                   |
| Miel                          |        | Honey                                                 | Directa                                                                                  |
| Mermelada                     |        | Jams and preserves                                    | Promedio genérico USDA; fruta y concentración de azúcar variables                        |
| Chocolate con leche           |        | Candies, milk chocolate                               | Directa                                                                                  |
| Chocolate amargo al 70 %      |        | Chocolate, dark, 70-85% cacao solids                  | Entrada USDA de 70 a 85 % de cacao; no representa exactamente todas las tabletas al 70 % |
| Helado de crema de vainilla   |        | Ice creams, vanilla                                   | Helado de vainilla USDA como referencia; heladería artesanal variable                    |
| Barra de cereal de granola    |        | Snacks, granola bars, hard, plain                     | Granola bar dura USDA; no equivale a todas las barras locales                            |
| Salsa de tomate en conserva   |        | Tomato products, canned, sauce, without salt added    | Directa                                                                                  |
| Puré de tomate en conserva    |        | Tomato products, canned, puree, without salt added    | Directa                                                                                  |
| Extracto de tomate            |        | Tomato products, canned, paste, without salt added    | Directa                                                                                  |
| Ketchup                       |        | Catsup                                                | Directa                                                                                  |
| Mostaza preparada             |        | Mustard, prepared, yellow                             | Directa                                                                                  |
| Salsa de soja                 |        | Soy sauce made from soy and wheat (shoyu)             | Directa                                                                                  |
| Sal de mesa                   |        | Salt, table                                           | Directa                                                                                  |
| Gelatina preparada con azúcar |        | Gelatin desserts, prepared with water                 | Directa                                                                                  |
| Flan de vainilla              |        | Desserts, flan, caramel custard, prepared-from-recipe | Flan de huevo con caramelo USDA; proporciones de la receta variables                     |
| Leche condensada azucarada    |        | Milk, canned, condensed, sweetened                    | Directa                                                                                  |
