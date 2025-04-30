const rssPlugin = require('@11ty/eleventy-plugin-rss');
const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');
const fs = require('fs');

// Import filters
const dateFilter = require('./src/filters/date-filter.js');
const markdownFilter = require('./src/filters/markdown-filter.js');
const w3DateFilter = require('./src/filters/w3-date-filter.js');
const myDateFilter = require('./src/filters/date-month-year-filter.js');
const myDateFilterds = require('./src/filters/date-filter-md.js');

// Import transforms
const htmlMinTransform = require('./src/transforms/html-min-transform.js');
const parseTransform = require('./src/transforms/parse-transform.js');

// Import data files
const site = require('./src/_data/site.json');

module.exports = function(config) {
  // Filters
  config.addFilter('dateFilter', dateFilter);
  config.addFilter('markdownFilter', markdownFilter);
  config.addFilter('w3DateFilter', w3DateFilter);
  config.addFilter('myDateFilter', myDateFilter);
  config.addFilter('myDateFilterds', myDateFilterds);

  // Layout aliases
  config.addLayoutAlias('home', 'layouts/home.njk');

  // Transforms
  config.addTransform('htmlmin', htmlMinTransform);
  config.addTransform('parse', parseTransform);

  // Passthrough copy
  config.addPassthroughCopy('src/fonts');
  config.addPassthroughCopy('src/images');
  config.addPassthroughCopy('src/js');
  config.addPassthroughCopy('src/admin/config.yml');
  config.addPassthroughCopy('src/admin/previews.js');
  config.addPassthroughCopy('node_modules/nunjucks/browser/nunjucks-slim.js');
  config.addPassthroughCopy('src/robots.txt');
  config.addPassthroughCopy('src/_includes/assets/css')
  config.addPassthroughCopy('package.json')
  config.addPassthroughCopy('package-lock.json')

  const now = new Date();

  // Custom collections
  const livePosts = post => post.date <= now && !post.data.draft;
  
  config.addCollection('posts', collection => {
    return [
      ...collection.getFilteredByGlob('./src/posts/*.md').filter(livePosts)
    ].reverse();
  });

  config.addCollection('postFeed', collection => {
    return [...collection.getFilteredByGlob('./src/posts/*.md').filter(livePosts)]
      .reverse()
      .slice(0, site.maxPostsPerPage);
  });

  // Publications collection 

  config.addCollection('publication', collection => {
    return [
      ...collection.getFilteredByGlob('./src/publications/*.md')
    ].reverse();
  });

  config.addCollection('publicationFeed', collection => {
    return [...collection.getFilteredByGlob('./src/publications/*.md')]
      .reverse()
      .slice(0, site.maxPublicationsPerPage);
  });

  // Blogs collection 

  config.addCollection('blogs', collection => {
    return [
      ...collection.getFilteredByGlob('./src/blogs/*.md')
    ].reverse();
  });

  config.addCollection('blogsFeed', collection => {
    return [...collection.getFilteredByGlob('./src/blogs/*.md')]
      .reverse()
      .slice(0, site.maxBlogsPerPage);
  });

  // Blogs collection 

  config.addCollection('community', collection => {
    return [
      ...collection.getFilteredByGlob('./src/community/*.md')
    ].reverse();
  });

  config.addCollection('communityFeed', collection => {
    return [...collection.getFilteredByGlob('./src/community/*.md')]
      .reverse()
      .slice(0, site.maxBlogsPerPage);
  });
  
  // Timeline collection
  config.addCollection('timeline', collection => {
    return collection.getFilteredByGlob('./src/timeline/*.md')
      .filter(item => item.data.date) // Ensure items have a date
      .filter(item => item.data.title)
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date)); // Sort by date descending
  });

  // Skills collection 
  config.addCollection('skills', collectionApi => {
    return collectionApi.getFilteredByGlob('./src/Skills/*.md');
  });

  // Plugins
  config.addPlugin(rssPlugin);
  config.addPlugin(syntaxHighlight);

  // 404
  config.setBrowserSyncConfig({
    callbacks: {
      ready: function(err, browserSync) {
        const content_404 = fs.readFileSync('dist/404.html');

        browserSync.addMiddleware('*', (req, res) => {
          // Provides the 404 content without redirect.
          res.write(content_404);
          res.end();
        });
      }
    }
  });

  return {
    dir: {
      input: 'src',
      output: 'dist'
    },
    passthroughFileCopy: true, 
    pathPrefix: '/'  // Set the prefix to '/' for GitHub Pages
  };
};