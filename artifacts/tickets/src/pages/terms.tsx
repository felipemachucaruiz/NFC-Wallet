export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">Términos y Condiciones</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Estatutos de Operación y Contrato de Adhesión — TAPEE
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3">Cláusula Primera: Naturaleza del Vínculo Jurídico</h2>
          <p className="text-muted-foreground leading-relaxed">
            El presente documento constituye un contrato de adhesión vinculante entre cualquier persona física o jurídica que acceda a la infraestructura de TAPEE (el "Usuario") y TAPEE. Al navegar por la Plataforma o adquirir servicios, el Usuario acepta de forma incondicional todas las disposiciones aquí contenidas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Cláusula Segunda: Intermediación Técnica y Exclusión de Responsabilidad Organizativa</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            El Usuario reconoce expresamente que TAPEE opera bajo un modelo de Software como Servicio (SaaS) y actúa exclusivamente como un Intermediario Tecnológico.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Independencia:</span> TAPEE no es propietario, organizador, promotor, administrador ni responsable de la logística de los eventos publicados.</li>
            <li><span className="font-medium text-foreground">Responsabilidad del Espectáculo:</span> El Organizador del Evento es el único sujeto obligado frente al Usuario por la ejecución, calidad, seguridad, cambios de programación, cancelaciones y cumplimiento de las normas de salud pública y policía.</li>
            <li><span className="font-medium text-foreground">Garantías del Evento:</span> Cualquier reclamación relativa al contenido del espectáculo, el line-up de artistas, el sonido, la iluminación o la acomodación debe dirigirse al Organizador, cuyos datos aparecen en el resumen de compra.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Cláusula Tercera: Condiciones de Acceso y Uso del Hardware NFC</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            En eventos donde se implemente tecnología de Identificación por Radiofrecuencia (RFID/NFC):
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Carácter Personal:</span> La manilla o dispositivo NFC es personal e intransferible. El uso por parte de terceros podrá resultar en la invalidación del acceso sin reembolso.</li>
            <li><span className="font-medium text-foreground">Cuidado y Riesgo:</span> El Usuario asume el riesgo de pérdida, robo, extravío o daño físico del dispositivo NFC una vez entregado. La exposición a altas temperaturas, humedad extrema, campos magnéticos o manipulación mecánica del chip invalidará la garantía del dispositivo.</li>
            <li><span className="font-medium text-foreground">Reposiciones:</span> En caso de daño por culpa del Usuario, la reposición de la manilla estará sujeta a la disponibilidad técnica y a los costos administrativos que el Organizador y TAPEE determinen.</li>
            <li><span className="font-medium text-foreground">Uso Indebido:</span> Queda terminantemente prohibido el uso de dispositivos de clonación o "sniffing" sobre el ecosistema de TAPEE. Estas conductas serán perseguidas bajo la Ley 1273 de 2009 (Delitos Informáticos).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Cláusula Cuarta: Propiedad Intelectual y Activos Digitales</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Todos los derechos de propiedad intelectual sobre la Plataforma, incluyendo pero no limitado a: código objeto y fuente, algoritmos de encriptación, interfaces de usuario (UI), esquemas de experiencia (UX), gráficos, logotipos, bases de datos y manuales de operación, son propiedad exclusiva de TAPEE.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Licencia Limitada:</span> Se otorga al Usuario una licencia no exclusiva, revocable e intransferible para el uso personal de la Plataforma con fines de compra y validación.</li>
            <li><span className="font-medium text-foreground">Prohibiciones:</span> Se prohíbe el desensamblaje, ingeniería inversa, creación de obras derivadas o cualquier método de extracción de datos ("web scraping") no autorizado por escrito.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Cláusula Quinta: Precios, Pagos y Cargos por Servicio</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Composición del Precio:</span> El precio total visualizado en el check-out se compone del valor facial de la entrada (fijado por el Organizador), los impuestos aplicables (IVA/Consumo) y el Cargo por Servicio de Tecnología (Service Fee).</li>
            <li><span className="font-medium text-foreground">Ejecución del Servicio:</span> El Usuario acepta que el Cargo por Servicio remunera el uso de la plataforma, el procesamiento de la transacción y la emisión del ticket, servicios que se consideran plenamente ejecutados al momento de confirmarse la compra.</li>
            <li><span className="font-medium text-foreground">Seguridad en Pagos:</span> Las transacciones se realizan a través de pasarelas de pago certificadas (PCI-DSS). TAPEE no almacena datos sensibles de tarjetas de crédito.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Cláusula Sexta: Limitación de Responsabilidad Técnica (SLA)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            TAPEE se esfuerza por mantener una disponibilidad del 99.9% de sus servicios; sin embargo, no garantiza el acceso ininterrumpido en casos de:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Fallas en los nodos troncales de internet.</li>
            <li>Interrupciones en el suministro eléctrico de los recintos de eventos.</li>
            <li>Ataques coordinados de denegación de servicio (DDoS).</li>
            <li>Incompatibilidad con sistemas operativos desactualizados o dispositivos móviles modificados (jailbreak/root).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Cláusula Séptima: Jurisdicción y Ley Aplicable</h2>
          <p className="text-muted-foreground leading-relaxed">
            Este contrato se rige íntegramente por las leyes de la República de Colombia. Para cualquier litigio, las partes renuncian a otros fueros y se someten a los juzgados competentes de la ciudad de Medellín.
          </p>
        </section>

      </div>
    </div>
  );
}
