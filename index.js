var fs = require('fs');
var path = require('path');
var parseURL = require('url').parse;
var reduceFunctionCall = require('reduce-function-call');
var mkdirp = require('mkdirp');
var postcss = require('postcss');
var chalk = require('chalk');

var rebasedAssets = new Array();

module.exports = postcss.plugin('postcss-assets-rebase', function(options) {

	return function(css, postcssOptions) {
		var to = postcssOptions.opts.to ? path.dirname(postcssOptions.opts.to) : '.';

		if (options && options.assetsPath) {
			css.eachDecl(function(decl) {
				if (decl.value && decl.value.indexOf('url(') > -1) {
					processDecl(decl, to, options);
				}
			})
		} else {
			console.warn(chalk.red('postcss-assets-rebase: No assets path provided, aborting'));
		}
	}
});

function processDecl(decl, to, options) {

	var dirname = (decl.source && decl.source.input) ? path.dirname(decl.source.input.file) : process.cwd();

	decl.value = reduceFunctionCall(decl.value, 'url', function(value) {
		var url = getUrl(value),
			processedUrl;

		if (isLocalImg(url)) {
			processedUrl = processUrlRebase(dirname, url, to, options);
		} else {
			processedUrl = composeUrl(url);
		}

		return processedUrl;
	});
}

function getUrl(url) {
	return url.match(/(['"]?)(.+)\1/)[2];
}

function normalizeUrl(url) {
	return (path.sep === '\\') ? url.replace(/\\/g, '\/') : url;
}

function composeUrl(url) {
	return 'url(' + normalizeUrl(url) + ')';
}

// checks if file is not local
function isLocalImg(url) {
	var notLocal = url.indexOf('data:') === 0 ||
		url.indexOf('#') === 0 ||
		/^[a-z]+:\/\//.test(url);

	return !notLocal;
}

//copy asset and place it to assets folder
function copyAsset(assetPath, contents) {
	mkdirp.sync(path.dirname(assetPath));
	if (!fs.existsSync(assetPath)) {
		fs.writeFileSync(assetPath, contents);
	}
}
function composeDuplicatePath(assetPath, index) {
	var extname = path.extname(assetPath);
	var fileName = path.basename(assetPath, extname);
	var dirname = path.dirname(assetPath);

	return path.join(dirname, fileName + '_' + index + extname);
}

function getDuplicateIndex(assetPath) {
	var index = 0;
	var duplicatePath;
	if (fs.existsSync(assetPath)) {
		do {
			duplicatePath = composeDuplicatePath(assetPath, ++index);
		} while (fs.existsSync(duplicatePath))
	}
	return index;

}
//get asset content
function getAsset(filePath) {
	if (fs.existsSync(filePath)) {
		return fs.readFileSync(filePath);
	} else {
		console.warn(chalk.yellow('postcss-assets-rebase: Can\'t read file \'' + filePath + '\', ignoring'));
	}

}

function getPostfix(url) {
	var parsedURL = parseURL(url);
	var postfix = '';

	if (parsedURL.search) {
		postfix += parsedURL.search;
	}

	if (parsedURL.hash) {
		postfix += parsedURL.hash;
	}

	return postfix;
}

function getClearUrl(url) {
	return parseURL(url).pathname;
}
function isRebasedAlready(filePath) {
	for (var i = 0; i < rebasedAssets.length; i++) {
		if (rebasedAssets[i][0] === filePath) {
			return {
				absolute:rebasedAssets[i][1],
				relative: rebasedAssets[i][2]
			};
		}
	}
	return null;
}
function processUrlRebase(dirname, url, to, options) {

	var relativeAssetsPath = '';
	var absoluteAssetsPath = '.';

	var postfix = getPostfix(url);
	var clearUrl = getClearUrl(url);

	var filePath = path.resolve(dirname, clearUrl);
	var fileName = path.basename(clearUrl);

	var assetContents = getAsset(filePath);

	if (!assetContents) {
		return composeUrl(url);
	}

	if (options.relative) {
		absoluteAssetsPath = path.resolve(to, options.assetsPath);
		relativeAssetsPath = options.assetsPath;
	} else {
		absoluteAssetsPath = path.resolve(options.assetsPath);
		relativeAssetsPath = path.relative(to, absoluteAssetsPath);
	}

	absoluteAssetsPath = path.join(absoluteAssetsPath, fileName);
	relativeAssetsPath = path.join(relativeAssetsPath, fileName);

	if (options.renameDuplicates) {
		if (isRebasedAlready(filePath)) {
			absoluteAssetsPath = isRebasedAlready(filePath).absolute;
			relativeAssetsPath = isRebasedAlready(filePath).relative;
		} else {
			var index = getDuplicateIndex(absoluteAssetsPath);
			if (index) {
				relativeAssetsPath = composeDuplicatePath(relativeAssetsPath, index);
				absoluteAssetsPath = composeDuplicatePath(absoluteAssetsPath, index);
				console.warn(chalk.yellow('postcss-assets-rebase: duplicated path \'' + filePath + '\' renamed to: ' +
					relativeAssetsPath));
			}
			rebasedAssets.push([filePath, absoluteAssetsPath, relativeAssetsPath]);

		}
	}
	copyAsset(absoluteAssetsPath, assetContents);

	if (postfix) {
		relativeAssetsPath += postfix;
	}

	return composeUrl(relativeAssetsPath);
}
