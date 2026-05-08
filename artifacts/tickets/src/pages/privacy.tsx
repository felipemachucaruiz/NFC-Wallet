import { SEO } from "@/components/SEO";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <SEO
        title="Política de Privacidad | Tapee Tickets"
        description="Política de tratamiento de datos personales de Tapee. Conoce cómo protegemos tu información personal."
        url="https://tapeetickets.com/privacidad"
      />
      <h1 className="text-3xl font-bold mb-2">Política de Tratamiento de Datos Personales</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Política Integral de Tratamiento de Datos Personales — Habeas Data — TAPEE
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">I. Marco Normativo y Principios Rectores</h2>
          <p className="text-muted-foreground leading-relaxed">
            La presente Política de Tratamiento de Datos Personales se fundamenta en la Constitución Política de Colombia (Art. 15), la Ley 1581 de 2012, el Decreto 1377 de 2013 y la Sentencia C-748 de 2011. TAPEE se compromete a aplicar de manera rigurosa los principios de legalidad, finalidad, libertad, veracidad, transparencia, acceso y circulación restringida, seguridad y confidencialidad en el manejo de la información.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">II. Identificación y Domicilio del Responsable</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Titular:</span> TAPEE S.A.S. (en adelante, "TAPEE" o el "Responsable").</li>
            <li><span className="font-medium text-foreground">Identificación Tributaria:</span> 901890734-3</li>
            <li><span className="font-medium text-foreground">Domicilio Legal:</span> Medellín, Antioquia, Colombia.</li>
            <li><span className="font-medium text-foreground">Canales de Atención:</span> Correo electrónico <a href="mailto:hola@tapee.app" className="text-primary hover:underline">hola@tapee.app</a> para la recepción de consultas, peticiones, quejas y reclamos (PQR) relacionados con el tratamiento de datos.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">III. Definiciones Técnicas Legales</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Autorización:</span> Consentimiento previo, expreso e informado del Titular.</li>
            <li><span className="font-medium text-foreground">Base de Datos:</span> Conjunto organizado de datos personales objeto de Tratamiento.</li>
            <li><span className="font-medium text-foreground">Encargado del Tratamiento:</span> Persona que realiza el tratamiento por cuenta del Responsable.</li>
            <li><span className="font-medium text-foreground">Dato Sensible:</span> Aquellos que afectan la intimidad del Titular o cuyo uso indebido puede generar discriminación (ej. biometría en eventos).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">IV. Categorías de Datos y Métodos de Recolección</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            TAPEE recolectará datos a través de sus interfaces digitales, formularios de registro, dispositivos de lectura NFC y comunicaciones directas. Las categorías incluyen:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Datos de Identificación Personal:</span> Nombres, apellidos, número de identificación, género, edad y fotografía de perfil (opcional).</li>
            <li><span className="font-medium text-foreground">Datos de Contacto:</span> Direcciones de correo electrónico, números de telefonía móvil, perfiles de redes sociales y direcciones de facturación.</li>
            <li><span className="font-medium text-foreground">Datos de Tráfico y Navegación:</span> Direcciones IP, identificadores de sesión, tipos de navegador, sistemas operativos, registros de "logs", geolocalización basada en nodos de red y patrones de comportamiento dentro de la aplicación.</li>
            <li><span className="font-medium text-foreground">Datos Técnicos de Proximidad (NFC):</span> Identificadores de dispositivos vinculados (UID de chips), marcas de tiempo de ingreso y salida, histórico de validaciones en puntos de control y consumos asociados si la manilla cuenta con sistema cashless.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">V. Finalidades del Tratamiento (Usos Autorizados)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            El Titular, al aceptar esta política, autoriza de manera expresa a TAPEE para tratar sus datos con los siguientes fines:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Operación del Servicio:</span> Gestión de preventas, ventas, reservas, emisión de tickets digitales y entrega física de dispositivos NFC.</li>
            <li><span className="font-medium text-foreground">Seguridad y Prevención de Riesgos:</span> Verificación de identidad para mitigar fraudes en transacciones electrónicas y prevenir la suplantación de identidad en el ingreso a eventos.</li>
            <li><span className="font-medium text-foreground">Soporte Técnico y PQR:</span> Atender consultas técnicas sobre el funcionamiento de la plataforma o la integridad de los dispositivos NFC.</li>
            <li><span className="font-medium text-foreground">Relación con el Organizador:</span> Transferir los datos de asistencia al Organizador del Evento para fines de pólizas de seguros de asistentes, control de aforo y logística de emergencia.</li>
            <li><span className="font-medium text-foreground">Marketing y Fidelización:</span> Envío de información publicitaria, boletines, ofertas comerciales y encuestas de satisfacción. El Titular podrá revocar esta finalidad en cualquier momento.</li>
            <li><span className="font-medium text-foreground">Analítica Masiva:</span> Realizar estudios estadísticos sobre tendencias de asistencia, horas pico de ingreso y mapas de calor en eventos para mejorar la seguridad pública.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VI. Derechos de los Titulares (Art. 8 Ley 1581)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Conocimiento:</span> Acceder de forma gratuita a los datos personales que hayan sido objeto de Tratamiento.</li>
            <li><span className="font-medium text-foreground">Actualización y Rectificación:</span> Solicitar la corrección de datos parciales, inexactos, incompletos o que induzcan a error.</li>
            <li><span className="font-medium text-foreground">Prueba de Autorización:</span> Solicitar prueba de la autorización otorgada al Responsable del Tratamiento.</li>
            <li><span className="font-medium text-foreground">Revocatoria y Supresión:</span> Solicitar la supresión del dato o revocar la autorización cuando no se respeten los principios legales, previa queja ante la Superintendencia de Industria y Comercio (SIC).</li>
            <li><span className="font-medium text-foreground">Información:</span> Ser informado sobre el uso que se le ha dado a sus datos personales.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VII. Protocolos de Seguridad y Confidencialidad</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            TAPEE declara que cuenta con medidas de seguridad física, técnica y administrativa para evitar el acceso no autorizado. Esto incluye:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Protocolos de cifrado de extremo a extremo en la transmisión de datos.</li>
            <li>Servidores con redundancia y almacenamiento en la nube bajo estándares internacionales (SOC 2 / ISO 27001).</li>
            <li>Acceso restringido a la base de datos solo a personal autorizado bajo acuerdos de confidencialidad estricta.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VIII. Vigencia y Modificaciones</h2>
          <p className="text-muted-foreground leading-relaxed">
            La presente política entra en vigor el día de su publicación. TAPEE se reserva el derecho de modificarla en cualquier momento para adaptarla a cambios legislativos o tecnológicos. Cualquier cambio sustancial será notificado a través de los canales de contacto registrados.
          </p>
        </section>

      </div>
    </div>
  );
}
