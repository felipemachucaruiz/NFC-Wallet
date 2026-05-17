require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'nfc-hce'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = package['license']
  s.homepage       = package['homepage']
  s.authors        = package['author']
  s.source         = { git: '' }
  s.platforms      = { ios: '15.1' }
  s.swift_version  = '5.4'
  s.source_files   = 'ios/**/*.{h,m,mm,swift}'
  s.dependency 'ExpoModulesCore'
end
