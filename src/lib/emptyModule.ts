// Stand-in for jsPDF's optional peers (html2canvas, canvg, dompurify):
// they back doc.html() and SVG rendering, which the note export never
// calls, so aliasing them here keeps ~380 KB out of dist/ and the SW precache.
export default {};
