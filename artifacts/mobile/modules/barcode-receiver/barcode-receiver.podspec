require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'barcode-receiver'
  s.version        = package['version']
  s.summary        = package['description']
  s.homepage       = 'https://github.com/felipemachucadj'
  s.license        = 'MIT'
  s.authors        = 'Tapee'
  s.platform       = :ios, '16.0'
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = 'ios/**/*.{h,m,mm,swift,hpp,cpp}'
end
