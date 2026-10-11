/* Paste a passage of enumerable facts into the Make Cards text box. The
 * numbered Q/A pairs make the generator emit one card per line, which is what
 * the pagination in the next shot needs (50 rows per page), and the whole
 * passage stays under the box's 750-word limit. */
const passage = `1. Which chamber pumps blood to the body? The left ventricle, via the aorta.
2. Which chamber receives oxygenated blood? The left atrium, via the pulmonary veins.
3. Which chamber pumps blood to the lungs? The right ventricle, via the pulmonary valve.
4. Which chamber receives venous blood? The right atrium, via the venae cavae.
5. What is a normal adult resting heart rate? Sixty to one hundred beats a minute.
6. Where is the sinoatrial node? In the upper right atrium near the vena cava.
7. What is the sinoatrial node's intrinsic rate? Sixty to one hundred per minute.
8. What is the atrioventricular node's intrinsic rate? Forty to sixty per minute.
9. What is the Purkinje system's intrinsic rate? Twenty to forty per minute.
10. What does the P wave show? Atrial depolarisation.
11. What does the QRS complex show? Ventricular depolarisation.
12. What does the T wave show? Ventricular repolarisation.
13. What does the PR interval measure? Atrial to ventricular depolarisation time.
14. What is a normal PR interval? One hundred twenty to two hundred milliseconds.
15. What is a normal QRS duration? Under one hundred twenty milliseconds.
16. What is stroke volume? Blood ejected by one ventricle per beat.
17. What is cardiac output? Stroke volume times heart rate.
18. What is a normal resting cardiac output? About five litres per minute.
19. What is preload? End-diastolic wall stress, estimated by end-diastolic volume.
20. What is afterload? The resistance the ventricle ejects against.
21. What does the Frank-Starling law state? More filling means a stronger contraction.
22. Which valve lies between left atrium and ventricle? The mitral valve.
23. Which valve lies between right atrium and ventricle? The tricuspid valve.
24. Which valve lies between left ventricle and aorta? The aortic valve.
25. Which valve lies between right ventricle and pulmonary artery? The pulmonary valve.
26. What causes the first heart sound? Mitral and tricuspid closure.
27. What causes the second heart sound? Aortic and pulmonary closure.
28. Where is the apex beat felt? Fifth intercostal space, midclavicular line.
29. Which artery supplies the anterior left ventricle? The left anterior descending artery.
30. Which artery supplies the inferior wall? The right coronary artery.
31. What does the circumflex artery supply? The lateral left ventricular wall.
32. Which vein drains the myocardium? The coronary sinus.
33. What is systole? The contraction phase that ejects blood.
34. What is diastole? The relaxation phase that fills the ventricle.
35. What is isovolumetric contraction? Contraction with both valves closed.
36. What is isovolumetric relaxation? Relaxation before the mitral valve opens.
37. What is ejection fraction? Stroke volume divided by end-diastolic volume.
38. What is a normal ejection fraction? Fifty-five to seventy percent.
39. What is the cardiac index? Cardiac output divided by body surface area.
40. What is a normal cardiac index? Two and a half to four litres per minute per square metre.
41. What does the mitral valve do in systole? It stays closed.
42. Which muscles elevate the ribs in inspiration? The external intercostals.
43. Which nerve drives the diaphragm? The phrenic nerve, from C3 to C5.
44. What is normal intrapleural pressure? About minus five centimetres of water.
45. What is tidal volume at rest? About five hundred millilitres.
46. What is anatomical dead space? About one hundred fifty millilitres.
47. Which factor most affects airway resistance? Bronchial calibre.
48. What lowers compliance? Fibrosis, oedema and chest wall deformity.
49. What is the function of surfactant? It lowers alveolar surface tension.
50. What is Fick's law about? Diffusion across a surface area and gradient.
51. How is oxygen mostly carried? Bound to haemoglobin.
52. How much oxygen does one gram of haemoglobin bind? About 1.34 millilitres.
53. What is oxygen capacity at haemoglobin 15? About twenty millilitres per decilitre.
54. Why is the dissociation curve sigmoid? Cooperative haemoglobin binding.
55. What shifts the curve right? Carbon dioxide, acidosis, heat and 2,3-BPG.
56. How is carbon dioxide mostly carried? As plasma bicarbonate.
57. What is the chloride shift? Chloride entering as bicarbonate leaves the red cell.
58. Where is the respiratory rhythm generated? In the medulla.
59. What is the strongest respiratory stimulus? Rising carbon dioxide.
60. What do peripheral chemoreceptors sense? Hypoxaemia below sixty millimetres of mercury.`;

demo.setValue('.card-previewer textarea', passage);
