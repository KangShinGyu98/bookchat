const { algoliasearch, instantsearch } = window;

const searchClient = algoliasearch('FEFKVKE9CI', 'f5a80954d9aadcbf3b034a85d791129e');

const search = instantsearch({
  indexName: 'bookchat-algolia-index',
  searchClient,
  future: { preserveSharedStateOnUnmount: true },
  
});


search.addWidgets([
  instantsearch.widgets.searchBox({
    container: '#searchbox',
  }),
  instantsearch.widgets.hits({
    container: '#hits',
    templates: {
      item: (hit, { html, components }) => html`
<article>
  <div>
    <h1>${components.Highlight({hit, attribute: "title"})}</h1>
    <p>${components.Highlight({hit, attribute: "author"})}</p>
    <p>${components.Highlight({hit, attribute: "rating"})}</p>
  </div>
</article>
`,
    },
  }),
  instantsearch.widgets.configure({
    hitsPerPage: 8,
  }),
  instantsearch.widgets.pagination({
    container: '#pagination',
  }),
]);

search.start();

